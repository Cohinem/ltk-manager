//! Getting mods into and out of the library.
//!
//! Installing happens in two halves. Staging unpacks the archive into
//! `mods/.staging-<uuid>/` and copies the archive itself to
//! `mods/.staging-<uuid>.<ext>`, which is the slow part and holds no lock.
//! Registering assigns the slug, renames both into place, and does the index
//! bookkeeping under the index lock. Splitting them is what lets a bulk install
//! unpack every file before taking the lock once.
//!
//! Uninstalling reverses both and scrubs the mod from every profile and folder.

use crate::config::Config;
use crate::error::{AppError, AppResult, Utf8PathExt};
use crate::events::{BackendEvent, InstallProgress};
use crate::mods::ModLibrary;
use crate::mods::archive::metadata::{
    extract_modpkg_metadata, load_mod_project, read_installed_mod,
};
use crate::mods::index::document::archive_path;
use crate::mods::index::{HarvestSummary, LibraryIndex, LibraryModEntry, ModArchiveFormat};
use crate::mods::long_paths;
use crate::mods::slug::{ModSlug, TakenSlugs};
use crate::mods::types::{BulkInstallError, BulkInstallResult, InstalledMod, ROOT_FOLDER_ID};
use chrono::{DateTime, Utc};
use ltk_wad::PathResolver;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;

/// Prefix an in-flight install's directory and archive copy share under `mods/`.
///
/// The leading dot keeps them out of directory discovery, which walks `mods/`
/// looking for mod projects to re-register, and it is what the startup sweep
/// matches on.
pub(crate) const STAGING_PREFIX: &str = ".staging-";

/// What an install needs that the index does not hold.
pub(crate) struct InstallContext<'a> {
    /// Names for a packed WAD's chunks. Best-effort — with no tables the
    /// chunks land under their hex names, which the overlay reads either way.
    pub(crate) resolver: &'a dyn PathResolver,
    /// Whether a fantome keeps a copy of its source archive. Modpkg archives
    /// are always kept: the provider reads content out of them.
    pub(crate) retain_archive: bool,
}

/// A mod unpacked into its staging directory, not yet in the index.
#[derive(Debug)]
pub(crate) struct StagedMod {
    id: String,
    installed_at: DateTime<Utc>,
    format: ModArchiveFormat,
    staging_dir: PathBuf,
    /// The copy of the source archive, for a mod that keeps one.
    staged_archive: Option<PathBuf>,
    /// The project's `name`, which the slug is derived from. Not
    /// `display_name`: the directory should not move when a user renames a mod.
    project_name: String,
    /// The file this came from, so a register that fails names something the
    /// user recognizes rather than an empty row.
    source_path: String,
    /// What preserving the mod's names found. `None` for a modpkg.
    harvest: Option<HarvestSummary>,
}

impl StagedMod {
    /// Delete what staging left behind, for a register that could not finish.
    fn discard(&self) {
        if self.staging_dir.exists()
            && let Err(e) = fs::remove_dir_all(&self.staging_dir)
        {
            tracing::warn!(
                "Failed to clean up staging directory {}: {}",
                self.staging_dir.display(),
                e
            );
        }

        if let Some(archive) = &self.staged_archive
            && archive.exists()
            && let Err(e) = fs::remove_file(archive)
        {
            tracing::warn!(
                "Failed to clean up staged archive {}: {}",
                archive.display(),
                e
            );
        }
    }
}

/// What materializing one archive into staging produced.
#[derive(Debug)]
struct StagedContent {
    /// The project's `name`, which the slug is derived from.
    project_name: String,
    /// Whether the archive was copied beside the staging directory.
    kept_archive: bool,
    /// What preserving the mod's names found. `None` for a modpkg.
    harvest: Option<HarvestSummary>,
}

impl ModLibrary {
    pub fn install_mod_from_package(
        &self,
        config: &Config,
        file_path: &str,
    ) -> AppResult<InstalledMod> {
        let storage_dir = self.storage_dir(config)?;
        let resolver = self.wad_resolver();
        let staged = stage_mod_package(
            &storage_dir,
            file_path,
            &InstallContext {
                resolver: resolver.as_ref(),
                retain_archive: config.retain_mod_archives,
            },
        )?;

        self.mutate_index(config, |storage_dir, index| {
            let mut taken = TakenSlugs::collect(index, &storage_dir.join("mods"));
            let (_entry, installed_mod) =
                register_staged_mod(storage_dir, index, staged, &mut taken)?;
            Ok(installed_mod)
        })
    }

    /// Install multiple mods in a single batch operation.
    ///
    /// Unpacks every archive first, then takes the index lock once to register
    /// them all. Emits `"install-progress"` events per file.
    pub fn install_mods_from_packages(
        &self,
        config: &Config,
        file_paths: &[String],
    ) -> AppResult<BulkInstallResult> {
        if file_paths.is_empty() {
            return Ok(BulkInstallResult {
                installed: Vec::new(),
                failed: Vec::new(),
            });
        }

        let events = Arc::clone(self.events());
        let storage_dir = self.storage_dir(config)?;
        let resolver = self.wad_resolver();
        let context = InstallContext {
            resolver: resolver.as_ref(),
            retain_archive: config.retain_mod_archives,
        };

        let total = file_paths.len();
        let mut staged = Vec::new();
        let mut failed = Vec::new();

        for (i, file_path) in file_paths.iter().enumerate() {
            let file_name = file_name_of(file_path);
            events.emit(BackendEvent::InstallProgress(InstallProgress {
                current: i + 1,
                total,
                current_file: file_name.clone(),
            }));

            match stage_mod_package(&storage_dir, file_path, &context) {
                Ok(mod_package) => staged.push(mod_package),
                Err(e) => {
                    tracing::warn!("Failed to install {}: {}", file_path, e);
                    failed.push(BulkInstallError {
                        file_path: file_path.clone(),
                        file_name,
                        message: e.to_string(),
                    });
                }
            }
        }

        let mut installed = Vec::new();
        self.mutate_index(config, |storage_dir, index| {
            let mut taken = TakenSlugs::collect(index, &storage_dir.join("mods"));
            for mod_package in staged {
                let source_path = mod_package.source_path.clone();
                match register_staged_mod(storage_dir, index, mod_package, &mut taken) {
                    Ok((_entry, mod_info)) => installed.push(mod_info),
                    Err(e) => {
                        tracing::warn!("Failed to register {}: {}", source_path, e);
                        failed.push(BulkInstallError {
                            file_name: file_name_of(&source_path),
                            file_path: source_path,
                            message: e.to_string(),
                        });
                    }
                }
            }
            Ok(())
        })?;

        Ok(BulkInstallResult { installed, failed })
    }

    pub fn uninstall_mod_by_id(&self, config: &Config, mod_id: &str) -> AppResult<()> {
        self.mutate_index(config, |storage_dir, index| {
            let Some(pos) = index.mods.iter().position(|m| m.id == mod_id) else {
                return Err(AppError::ModNotFound(mod_id.to_string()));
            };

            let entry = index.mods.remove(pos);

            for folder in &mut index.folders {
                folder.mod_ids.retain(|id| id != mod_id);
            }

            for profile in &mut index.profiles {
                profile.mod_order.retain(|id| id != mod_id);
                profile.enabled_mods.retain(|id| id != mod_id);
                profile.layer_states.remove(mod_id);
            }

            entry.remove_files(storage_dir)
        })
    }
}

/// Unpack `file_path` into `mods/.staging-<uuid>/`, with its archive beside it.
///
/// Holds no lock, so a bulk install does this per file before taking one.
///
/// # Errors
///
/// Fails when the file is missing, the archive is malformed, or unpacking it
/// would write past the legacy Windows path limit.
pub(crate) fn stage_mod_package(
    storage_dir: &Path,
    file_path: &str,
    context: &InstallContext<'_>,
) -> AppResult<StagedMod> {
    let file_path = PathBuf::from(file_path);
    if !file_path.exists() {
        return Err(AppError::InvalidPath(file_path.display().to_string()));
    }

    // A fantome is a zip, which is what an archive arriving under a name
    // nothing recognizes most often turns out to be. Guessing modpkg instead
    // would record `Archive` on a mod with no packed form, and a modpkg is not
    // convertible, so nothing afterwards could undo the guess.
    let format = file_path
        .extension()
        .and_then(|ext| ext.to_str())
        .and_then(ModArchiveFormat::from_extension)
        .unwrap_or(ModArchiveFormat::Fantome);

    let id = Uuid::new_v4().to_string();
    let mods_dir = storage_dir.join("mods");
    let staging_dir = mods_dir.join(format!("{STAGING_PREFIX}{id}"));
    let staged_archive = mods_dir.join(format!("{STAGING_PREFIX}{id}.{}", format.extension()));
    fs::create_dir_all(&staging_dir)?;

    let staged = stage_into(&staging_dir, &staged_archive, &file_path, format, context)
        .inspect_err(|_| {
            let _ = fs::remove_dir_all(&staging_dir);
            let _ = fs::remove_file(&staged_archive);
        })?;

    Ok(StagedMod {
        id,
        installed_at: Utc::now(),
        format,
        staging_dir,
        staged_archive: staged.kept_archive.then_some(staged_archive),
        project_name: staged.project_name,
        source_path: file_path.display().to_string(),
        harvest: staged.harvest,
    })
}

/// Materialize one archive into `staging_dir`, copying the archive itself to
/// `staged_archive` when the mod keeps one.
///
/// Which mods keep one: per "Mod archive" in CONTEXT.md.
fn stage_into(
    staging_dir: &Path,
    staged_archive: &Path,
    file_path: &Path,
    format: ModArchiveFormat,
    context: &InstallContext<'_>,
) -> AppResult<StagedContent> {
    match format {
        // `Unknown` never reaches here — it is what a discovered directory
        // records, and nothing installs one.
        ModArchiveFormat::Fantome | ModArchiveFormat::Unknown => {
            // The name this mod's slug comes from is inside the archive being
            // read, so the directory it lands in is not knowable yet.
            let floor = staging_dir
                .parent()
                .map(long_paths::shortest_install_dir)
                .unwrap_or_else(|| staging_dir.to_path_buf());
            long_paths::preflight_fantome_import(
                file_path,
                &floor,
                long_paths::ImportRoot::ModStorage,
            )?;

            let source = file_path.to_path_buf().try_into_utf8("archive path")?;
            let dest = staged_archive
                .to_path_buf()
                .try_into_utf8("staged archive")?;
            let report =
                ltk_mod_project::preserve_archive_names(&source, &dest, Some(context.resolver))
                    .map_err(|e| {
                        AppError::Other(format!("Failed to preserve the mod's names: {e}"))
                    })?;
            tracing::info!(
                archive = %source,
                outcome = ?report.outcome,
                unharvestable = report.unharvestable,
                "Preserved the mod's names on import"
            );

            // Unpacked from the preserved copy, not the source, so an importer
            // that learns to carry declared tables into the tree reads them
            // from here with no change to this flow.
            let utf8_staging = staging_dir
                .to_path_buf()
                .try_into_utf8("staging directory")?;
            let project = ltk_mod_project::ProjectImporter::new(&utf8_staging)
                .import(
                    ltk_mod_project::fantome::FantomeImporter::new(fs::File::open(staged_archive)?)
                        .with_path_resolver(context.resolver),
                )
                .map_err(|e| AppError::Other(format!("Failed to import fantome archive: {e}")))?;

            let kept_archive = context.retain_archive
                || matches!(
                    report.outcome,
                    ltk_mod_project::PreserveOutcome::Rewritten { .. }
                );
            if !kept_archive {
                fs::remove_file(staged_archive)?;
            }

            Ok(StagedContent {
                project_name: project.name,
                kept_archive,
                harvest: Some(report.into()),
            })
        }
        ModArchiveFormat::Modpkg => {
            fs::copy(file_path, staged_archive)?;
            extract_modpkg_metadata(staged_archive, staging_dir)?;

            Ok(StagedContent {
                project_name: load_mod_project(staging_dir)?.name,
                kept_archive: true,
                harvest: None,
            })
        }
    }
}

/// Assign a slug, move the staged files into place, and record the mod.
///
/// Runs under the index lock. On any failure everything staging wrote is
/// removed, so a half-registered mod never outlives the call.
///
/// # Errors
///
/// Fails when the staged directory or its archive cannot be moved into place,
/// or when the config cannot be read back.
pub(crate) fn register_staged_mod(
    storage_dir: &Path,
    index: &mut LibraryIndex,
    staged: StagedMod,
    taken: &mut TakenSlugs,
) -> AppResult<(LibraryModEntry, InstalledMod)> {
    let slug = ModSlug::assign(&staged.project_name, taken);
    let mod_dir = storage_dir.join("mods").join(slug.as_str());

    if let Err(e) = fs::rename(&staged.staging_dir, &mod_dir) {
        staged.discard();
        return Err(AppError::Io(std::io::Error::new(
            e.kind(),
            format!("Failed to move staged mod into {}: {e}", mod_dir.display()),
        )));
    }

    // Only here is the tree standing where it will live, which is what the
    // preflight against a one-character slug could not answer for.
    if let Err(e) = long_paths::verify_unpacked(&mod_dir, long_paths::ImportRoot::ModStorage) {
        let _ = fs::remove_dir_all(&mod_dir);
        staged.discard();
        return Err(e);
    }

    if let Some(source) = &staged.staged_archive {
        let destination = archive_path(storage_dir, &slug, staged.format);
        if let Err(e) = fs::rename(source, &destination) {
            // A modpkg without its archive is not a mod, and a fantome that
            // lost the copy the user asked to keep should not pass for one
            // installed without retention.
            let _ = fs::remove_dir_all(&mod_dir);
            staged.discard();
            return Err(AppError::Io(std::io::Error::new(
                e.kind(),
                format!(
                    "Failed to move staged archive into {}: {e}",
                    destination.display()
                ),
            )));
        }
    }

    taken.insert(&slug);

    let entry = LibraryModEntry {
        id: staged.id,
        installed_at: staged.installed_at,
        format: staged.format,
        storage: staged.format.installed_storage(),
        slug: Some(slug),
        fault: None,
        harvest: staged.harvest,
    };
    let id = entry.id.clone();
    index.mods.push(entry.clone());

    if let Some(root) = index.folders.iter_mut().find(|f| f.id == ROOT_FOLDER_ID) {
        root.mod_ids.insert(0, id.clone());
    }

    let active_profile_id = index.active_profile_id.clone();
    if let Some(profile) = index
        .profiles
        .iter_mut()
        .find(|p| p.id == active_profile_id)
    {
        profile.enabled_mods.insert(0, id.clone());
        profile.mod_order.insert(0, id.clone());
    }

    // A re-installed mod can carry a different layer set, which would otherwise
    // leave states for layers it no longer has.
    if let Ok(project) = load_mod_project(&mod_dir) {
        let new_layer_names: std::collections::HashSet<&str> =
            project.layers.iter().map(|l| l.name.as_str()).collect();
        for profile in &mut index.profiles {
            if let Some(states) = profile.layer_states.get_mut(&id) {
                states.retain(|name, _| new_layer_names.contains(name.as_str()));
            }
        }
    }

    let installed_mod = read_installed_mod(&entry, true, storage_dir, None)?;
    Ok((entry, installed_mod))
}

/// Stage and register one mod in a single step, for callers already holding
/// the index lock — reconciliation's drop-folder discovery.
///
/// # Errors
///
/// Whatever [`stage_mod_package`] or [`register_staged_mod`] report.
pub(crate) fn install_single_mod_to_index(
    storage_dir: &Path,
    index: &mut LibraryIndex,
    file_path: &str,
    context: &InstallContext<'_>,
    taken: &mut TakenSlugs,
) -> AppResult<(LibraryModEntry, InstalledMod)> {
    let staged = stage_mod_package(storage_dir, file_path, context)?;
    register_staged_mod(storage_dir, index, staged, taken)
}

fn file_name_of(file_path: &str) -> String {
    Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(file_path)
        .to_string()
}

#[cfg(test)]
mod tests;
