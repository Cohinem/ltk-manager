//! A copy of one mod's content that a viewer reads as a project, which leaves the mod's
//! storage unchanged.

use crate::mods::ModLibrary;
use crate::mods::archive::documents::entry_of;
use fs_err as fs;
use ltk_file::LeagueFileKind;
use ltk_manager_base::config::Config;
use ltk_manager_base::error::{AppError, AppResult, Utf8PathExt};
use ltk_manager_base::utils::game::GameDir;
use ltk_overlay::ModContentProvider;
use ltk_overlay::content::archive_fingerprint;
use parking_lot::Mutex;
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, LazyLock};
use std::time::SystemTime;
use uuid::Uuid;

/// The layout of a copy, part of its directory name, so a copy that an older layout wrote is
/// unpacked again.
const COPY_FORMAT: u32 = 4;

/// How many mods keep a copy. Opening another mod deletes the copy that was used least recently.
const KEPT_COPIES: usize = 3;

/// The kinds of file that the skin viewer reads. A file of any other kind, an audio bank among
/// them, is not copied.
const VIEWED_KINDS: [LeagueFileKind; 9] = [
    LeagueFileKind::PropertyBin,
    LeagueFileKind::PropertyBinOverride,
    LeagueFileKind::SimpleSkin,
    LeagueFileKind::Skeleton,
    LeagueFileKind::Animation,
    LeagueFileKind::Texture,
    LeagueFileKind::TextureDds,
    LeagueFileKind::Png,
    LeagueFileKind::Jpeg,
];

/// One lock per mod, so two reads of one mod never delete each other's copy and an unpack of
/// one mod does not wait on another.
static UNPACKING: LazyLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    LazyLock::new(Default::default);

impl ModLibrary {
    /// Returns a project directory that holds the content of the mod `mod_id`.
    ///
    /// A Project-storage mod returns its own directory. An Archive-storage mod is copied to
    /// `cache_dir/<mod id>/<format>-<archive fingerprint>` once, and an older copy of the same mod
    /// is deleted. The copy holds only the files of [`VIEWED_KINDS`] in the archives of the
    /// install's champions, because those hold the skin bins. Only the [`KEPT_COPIES`] most
    /// recently used copies are kept.
    ///
    /// # Errors
    ///
    /// Fails if the mod is not in the library, its archive cannot be read, or the copy cannot
    /// be written.
    pub fn mod_content_dir(
        &self,
        config: &Config,
        mod_id: &str,
        cache_dir: &Path,
    ) -> AppResult<PathBuf> {
        let (storage_dir, entry) = self.with_index(config, |storage_dir, index| {
            Ok((storage_dir.to_path_buf(), entry_of(index, mod_id)?.clone()))
        })?;
        if !entry.is_packed() {
            return Ok(entry.mod_dir(&storage_dir));
        }

        let archive = entry
            .archive_path(&storage_dir)
            .try_into_utf8("archive path")?;
        let fingerprint = archive_fingerprint(&archive)
            .map_err(AppError::Overlay)?
            .ok_or_else(|| AppError::InvalidPath(format!("Mod archive missing: {archive}")))?;
        let mod_cache = cache_dir.join(&entry.id);
        let copy = mod_cache.join(format!("{COPY_FORMAT}-{fingerprint:016x}"));

        let champions: HashSet<String> = GameDir::resolve(config)?
            .champion_names()
            .into_iter()
            .map(|name| name.to_ascii_lowercase())
            .collect();

        let lock = Arc::clone(UNPACKING.lock().entry(entry.id.clone()).or_default());
        let _unpacking = lock.lock();
        if !copy.join("mod.config.json").is_file() {
            if mod_cache.exists() {
                fs::remove_dir_all(&mod_cache)?;
            }

            let staging = mod_cache.join(format!(".staging-{}", Uuid::new_v4()));
            unpack(
                entry.content_provider(&storage_dir)?.as_mut(),
                &champions,
                &staging,
            )
            .inspect_err(|_| {
                let _ = fs::remove_dir_all(&staging);
            })?;
            fs::rename(&staging, &copy)?;
        }

        mark_used(&copy)?;
        prune(cache_dir, &entry.id);

        Ok(copy)
    }
}

/// Sets the modification time of the manifest of `copy` to now, which [`prune`] orders copies by.
fn mark_used(copy: &Path) -> AppResult<()> {
    fs::File::options()
        .write(true)
        .open(copy.join("mod.config.json"))?
        .set_modified(SystemTime::now())?;

    Ok(())
}

/// Deletes the copy of each mod under `cache_dir` except `kept_mod` and the copies used most
/// recently, so at most [`KEPT_COPIES`] remain. Skips a mod directory that holds no finished
/// copy, which is one that another unpack is writing. A copy that cannot be deleted is logged.
fn prune(cache_dir: &Path, kept_mod: &str) {
    let Ok(entries) = fs::read_dir(cache_dir) else {
        return;
    };

    let mut copies: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|entry| entry.file_name() != kept_mod)
        .filter_map(|entry| Some((last_used(&entry.path())?, entry.path())))
        .collect();
    copies.sort_by_key(|(used, _)| std::cmp::Reverse(*used));

    for (_, mod_cache) in copies.into_iter().skip(KEPT_COPIES - 1) {
        if let Err(e) = fs::remove_dir_all(&mod_cache) {
            tracing::warn!(
                "Failed to delete the preview copy at {}: {e}",
                mod_cache.display()
            );
        }
    }
}

/// Returns the time that the finished copy under `mod_cache` was last used, and `None` if it
/// holds no finished copy.
fn last_used(mod_cache: &Path) -> Option<SystemTime> {
    fs::read_dir(mod_cache)
        .ok()?
        .flatten()
        .filter_map(|copy| {
            fs::metadata(copy.path().join("mod.config.json"))
                .ok()?
                .modified()
                .ok()
        })
        .max()
}

/// Writes the WAD overrides of `content` under `dir/content/<layer>/<wad>`, then the project's
/// `mod.config.json`. Skips each WAD that is not `<champion>.wad.client` for a champion in
/// `champions`, which are lowercase, and each file whose kind is not in [`VIEWED_KINDS`].
fn unpack(
    content: &mut dyn ModContentProvider,
    champions: &HashSet<String>,
    dir: &Path,
) -> AppResult<()> {
    let project = content.mod_project().map_err(AppError::Overlay)?;
    let root = dir.join("content");
    fs::create_dir_all(dir)?;

    for layer in &project.layers {
        let wads = content
            .list_layer_wads(&layer.name)
            .map_err(AppError::Overlay)?;

        for wad in wads {
            if !is_champion_archive(&wad, champions) {
                continue;
            }

            let wad_dir = join_plain(&root, &format!("{}/{wad}", layer.name))?;
            content
                .visit_wad_override(&layer.name, &wad, &mut |path, bytes| {
                    let kind = LeagueFileKind::identify_from_bytes(&bytes);
                    if !VIEWED_KINDS.contains(&kind) {
                        return Ok(());
                    }

                    let file = join_plain(&wad_dir, &named_by_kind(path.as_str(), kind))?;
                    if let Some(parent) = file.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    fs::write(&file, bytes)?;
                    Ok(())
                })
                .map_err(AppError::Overlay)?;
        }
    }

    fs::write(
        dir.join("mod.config.json"),
        serde_json::to_vec_pretty(&project)?,
    )?;

    Ok(())
}

/// Returns `true` if `wad` is `<champion>.wad.client` for a champion in `champions`. A locale
/// archive such as `Ahri.en_US.wad.client` holds no skin bin and returns `false`.
fn is_champion_archive(wad: &str, champions: &HashSet<String>) -> bool {
    wad.to_ascii_lowercase()
        .strip_suffix(".wad.client")
        .is_some_and(|stem| champions.contains(stem))
}

/// Returns `path` with the extension of `kind`, if `path` is a chunk hash.
///
/// A packed WAD names each chunk by its hash with a `.bin` extension, and the asset protocol
/// reads a file's kind from its extension. Returns `path` unchanged for a named path.
fn named_by_kind(path: &str, kind: LeagueFileKind) -> Cow<'_, str> {
    let stem = path.split_once('.').map_or(path, |(stem, _)| stem);
    if stem.len() != 16 || !stem.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Cow::Borrowed(path);
    }

    kind.extension().map_or(Cow::Borrowed(path), |extension| {
        Cow::Owned(format!("{stem}.{extension}"))
    })
}

/// Returns `root` joined with `relative`. Fails if `relative` is absolute or has a component
/// that is not a plain name, because an archive names the path.
fn join_plain(root: &Path, relative: &str) -> io::Result<PathBuf> {
    let path = Path::new(relative);
    if path.is_absolute() || !path.components().all(|c| matches!(c, Component::Normal(_))) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("Path escapes {}: {relative}", root.display()),
        ));
    }

    Ok(root.join(path))
}

#[cfg(test)]
mod tests;
