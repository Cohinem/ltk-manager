//! Mods the manager generates and injects above every other mod, per ADR-0043.

mod project;
mod ward_skins;

use crate::config::{BuiltinMods, Config};
use crate::error::{AppResult, Utf8PathExt};
use crate::utils::game::GameDir;
use fs_err as fs;
use ltk_overlay::{EnabledMod, FsModContent};
use project::GeneratedProject;
use std::path::Path;

/// The directory under the storage directory holding every built-in mod's project.
const DIR: &str = "builtin";

/// A mod the manager generates from the installed game, where a user installs every other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum BuiltinMod {
    /// Every ward shows its own base skin.
    DefaultWardSkins,
}

impl BuiltinMod {
    /// Every built-in mod, highest priority first.
    const ALL: [Self; 1] = [Self::DefaultWardSkins];

    /// The project directory's name, and the overlay mod id after `builtin:`.
    fn slug(self) -> &'static str {
        match self {
            Self::DefaultWardSkins => "default-ward-skins",
        }
    }

    fn is_enabled(self, switches: &BuiltinMods) -> bool {
        match self {
            Self::DefaultWardSkins => switches.default_ward_skins,
        }
    }

    /// The project this mod consists of against the game in `game_dir`.
    fn project(self, game_dir: &GameDir) -> AppResult<GeneratedProject> {
        match self {
            Self::DefaultWardSkins => ward_skins::project(game_dir),
        }
    }
}

/// How many built-in mods `switches` turns on, each one place above every other mod.
pub(crate) fn count_enabled(switches: &BuiltinMods) -> usize {
    BuiltinMod::ALL
        .into_iter()
        .filter(|builtin| builtin.is_enabled(switches))
        .count()
}

/// Write the project of each built-in mod `config` turns on, and remove the rest.
///
/// Answers the written projects as mods to inject, highest priority first.
///
/// # Errors
///
/// Fails when a project cannot be generated against the game in `game_dir` or written.
pub(crate) fn sync(
    storage_dir: &Path,
    config: &Config,
    game_dir: &GameDir,
) -> AppResult<Vec<EnabledMod>> {
    let root = storage_dir.join(DIR);
    let mut mods = Vec::new();
    for builtin in BuiltinMod::ALL {
        let dir = root.join(builtin.slug());
        if !builtin.is_enabled(&config.builtin_mods) {
            if dir.exists() {
                fs::remove_dir_all(&dir)?;
            }
            continue;
        }

        builtin.project(game_dir)?.write(&dir)?;
        let id = format!("builtin:{}", builtin.slug());
        tracing::info!("Adding built-in mod: id={}, path={}", id, dir.display());
        mods.push(EnabledMod {
            id,
            content: Box::new(FsModContent::new(dir.try_into_utf8("built-in mod path")?)),
            enabled_layers: None,
        });
    }
    Ok(mods)
}

#[cfg(test)]
mod tests;
