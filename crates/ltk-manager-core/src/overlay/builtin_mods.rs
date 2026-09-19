//! Mods the manager generates and injects above every other mod, per ADR-0043.

mod base_skins;
mod game_skins;
mod mod_skins;
mod overrides;
mod skin_bin;
mod stand_in;
mod ward_skins;

use crate::config::BuiltinModSettings;
use crate::error::{AppResult, Utf8PathExt};
use crate::utils::game::GameDir;
use base_skins::BaseSkins;
use fs_err as fs;
use ltk_overlay::{EnabledMod, FsModContent};
use ltk_wad::PathResolver;
use overrides::Overrides;
use std::path::Path;
use ward_skins::DefaultWardSkins;

/// The directory under the storage directory holding every built-in mod's project.
const DIR: &str = "builtin";

/// A mod the manager generates from the installed game and the mods below it.
trait BuiltinMod {
    /// The project directory's name, and the overlay mod id after `builtin:`.
    fn slug(&self) -> &'static str;

    /// The name a reader sees for the mod.
    fn display_name(&self) -> &'static str;

    /// The chunks the mod overrides, generated against `cx`.
    ///
    /// # Errors
    ///
    /// Fails when the game cannot be read or an override cannot be built.
    fn generate(&self, cx: &mut Context<'_>) -> AppResult<Overrides>;
}

/// What a built-in mod is generated against.
struct Context<'a> {
    game_dir: &'a GameDir,
    /// The WAD path tables, which name the chunks the game's archives hold.
    tables: &'a dyn PathResolver,
    /// Every mod below the built-in ones, highest priority first.
    mods: &'a mut [EnabledMod],
    /// Where the mod keeps its caches, a directory writing its overrides leaves alone.
    cache_dir: &'a Path,
}

/// Each built-in mod `settings` turns on, highest priority first.
fn enabled(settings: &BuiltinModSettings) -> Vec<Box<dyn BuiltinMod>> {
    let mut enabled: Vec<Box<dyn BuiltinMod>> = Vec::new();
    if settings.default_ward_skins {
        enabled.push(Box::new(DefaultWardSkins));
    }
    if let Some(base_skins) = BaseSkins::of(settings.base_skins) {
        enabled.push(Box::new(base_skins));
    }
    enabled
}

/// How many built-in mods `settings` turns on, each one place above every other mod.
pub(crate) fn count_enabled(settings: &BuiltinModSettings) -> usize {
    enabled(settings).len()
}

/// Put the built-in mods `settings` turns on above `mods`, writing each one's project first.
///
/// The storage directory keeps the project of each built-in mod turned on and nothing else.
/// `tables` names the chunks of the game in `game_dir`.
///
/// # Errors
///
/// Fails when a project cannot be generated against the game in `game_dir` or written.
pub(crate) fn inject(
    storage_dir: &Path,
    settings: &BuiltinModSettings,
    game_dir: &GameDir,
    tables: &dyn PathResolver,
    mut mods: Vec<EnabledMod>,
) -> AppResult<Vec<EnabledMod>> {
    let root = storage_dir.join(DIR);
    let enabled = enabled(settings);
    remove_all_but(&root, &enabled)?;

    let mut injected = Vec::with_capacity(enabled.len() + mods.len());
    for builtin in &enabled {
        let dir = root.join(builtin.slug());
        let mut cx = Context {
            game_dir,
            tables,
            mods: &mut mods,
            cache_dir: &dir,
        };
        builtin
            .generate(&mut cx)?
            .write(&dir, builtin.slug(), builtin.display_name())?;

        let id = format!("builtin:{}", builtin.slug());
        tracing::info!("Adding built-in mod: id={}, path={}", id, dir.display());
        injected.push(EnabledMod {
            id,
            content: Box::new(FsModContent::new(dir.try_into_utf8("built-in mod path")?)),
            enabled_layers: None,
        });
    }
    injected.extend(mods);
    Ok(injected)
}

/// Remove each directory in `root` that holds none of `kept`'s projects.
fn remove_all_but(root: &Path, kept: &[Box<dyn BuiltinMod>]) -> AppResult<()> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let path = entry?.path();
        let owned = kept
            .iter()
            .any(|builtin| path.file_name().is_some_and(|name| name == builtin.slug()));
        if !owned && path.is_dir() {
            fs::remove_dir_all(&path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
