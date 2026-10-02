//! The Native tab's commands. Fork-only: the LeagueSkins browser and its
//! apply-skin slot have no upstream counterpart, so they get their own row
//! here rather than living in the `mods` table.

use crate::error::{AppError, AppResult, IpcResult};
use crate::mods::{InstalledMod, ModLibraryState, ModSource};
use crate::patcher::PatcherState;
use crate::state::SettingsState;
use std::path::{Path, PathBuf};
use tauri::State;

/// Install a LeagueSkins package and enable it in the active profile.
///
/// LeagueSkins is a slot: whatever the tab applied before is replaced as part
/// of the same index transaction, so a failed apply leaves the old skin
/// standing and the library holds exactly one LeagueSkins skin. Mods the user
/// imported themselves are never touched.
#[tauri::command]
#[specta::specta]
pub fn apply_league_skin(
    champion_id: u32,
    skin_id: u32,
    chroma_id: Option<u32>,
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
    patcher: State<PatcherState>,
) -> IpcResult<InstalledMod> {
    let result: AppResult<InstalledMod> = (|| {
        let settings_snapshot = settings.0.lock().clone();
        let skins_root = settings_snapshot.league_skins_path.ok_or_else(|| {
            AppError::ValidationFailed(
                "Choose a LeagueSkins folder in Settings > General before applying a skin."
                    .to_string(),
            )
        })?;
        let package_path = find_league_skin_package(&skins_root, champion_id, skin_id, chroma_id)?;
        let config = settings_snapshot.config;
        let installed = library
            .0
            .install_mod_replacing_source(
                &config,
                package_path.to_string_lossy().as_ref(),
                ModSource::LeagueSkins,
            )?
            .into_mod();
        library
            .0
            .spawn_categorization(&config, vec![installed.id.clone()]);
        library
            .0
            .spawn_health_check(&config, vec![installed.id.clone()]);
        Ok(installed)
    })();
    patcher.refresh_overlay();
    result.into()
}

fn find_league_skin_package(
    root: &Path,
    champion_id: u32,
    skin_id: u32,
    chroma_id: Option<u32>,
) -> AppResult<PathBuf> {
    let champion = champion_id.to_string();
    let skin = skin_id.to_string();
    let variant = chroma_id.unwrap_or(skin_id).to_string();
    let mut parent_dirs = vec![root.to_path_buf(), root.join("classic"), root.join("skins")];

    if root.file_name().and_then(|name| name.to_str()) == Some("classic")
        || root.file_name().and_then(|name| name.to_str()) == Some("skins")
    {
        parent_dirs.retain(|path| path == root);
    }

    let mut candidates = Vec::new();
    for parent in parent_dirs {
        let champion_skin = parent.join(&champion).join(&skin);
        let direct_skin = parent.join(&skin);
        for skin_dir in [champion_skin, direct_skin] {
            if chroma_id.is_some() {
                candidates.push(skin_dir.join(&variant).join(format!("{variant}.fantome")));
            }
            candidates.push(skin_dir.join(format!("{skin}.fantome")));
        }
    }

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            AppError::InvalidPath(format!(
                "No LeagueSkins package found for champion {champion_id}, skin {skin_id}{} under {}",
                chroma_id.map_or(String::new(), |id| format!(" and chroma {id}")),
                root.display()
            ))
        })
}
