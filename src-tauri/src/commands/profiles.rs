use crate::error::{AppError, IpcResult};
use crate::mods::{ModLibraryState, Profile};
use crate::patcher::PatcherState;
use crate::state::SettingsState;
use tauri::State;

/// Get all profiles.
#[tauri::command]
pub fn list_mod_profiles(
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
) -> IpcResult<Vec<Profile>> {
    let config = settings.config();
    library.0.get_profiles(&config).into()
}

/// Get the currently active profile.
#[tauri::command]
pub fn get_active_mod_profile(
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
) -> IpcResult<Profile> {
    let config = settings.config();
    library.0.get_active_profile_info(&config).into()
}

/// Create a new profile with the given name.
#[tauri::command]
pub fn create_mod_profile(
    name: String,
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
) -> IpcResult<Profile> {
    let config = settings.config();
    library.0.create_profile(&config, name).into()
}

/// Delete a profile by ID.
#[tauri::command]
pub fn delete_mod_profile(
    profile_id: String,
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
) -> IpcResult<()> {
    let config = settings.config();
    library.0.delete_profile(&config, profile_id).into()
}

/// Switch to a different profile.
/// Returns an error if the patcher is currently running.
#[tauri::command]
pub fn switch_mod_profile(
    profile_id: String,
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
    patcher_state: State<PatcherState>,
) -> IpcResult<Profile> {
    if patcher_state.is_running() {
        return IpcResult::err(AppError::Other(
            "Cannot switch profiles while patcher is running. Please stop the patcher first."
                .to_string(),
        ));
    }

    let config = settings.config();
    library.0.switch_profile(&config, profile_id).into()
}

/// Rename a profile.
/// Returns an error if the patcher is currently running (rename touches the filesystem).
#[tauri::command]
pub fn rename_mod_profile(
    profile_id: String,
    new_name: String,
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
    patcher_state: State<PatcherState>,
) -> IpcResult<Profile> {
    if patcher_state.is_running() {
        return IpcResult::err(AppError::Other(
            "Cannot rename profiles while patcher is running. Please stop the patcher first."
                .to_string(),
        ));
    }

    let config = settings.config();
    library
        .0
        .rename_profile(&config, profile_id, new_name)
        .into()
}
