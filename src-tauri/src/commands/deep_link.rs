use crate::deep_link;
use crate::error::{AppError, AppResult, IpcResult};
use crate::mods::{InstalledMod, ModLibraryState};
use crate::patcher::PatcherState;
use crate::state::SettingsState;
use tauri::{AppHandle, State};

use super::mods::reject_if_patcher_running;

/// Install a mod from a deep-link protocol URL.
///
/// Downloads the file to a temp directory, validates it, then installs
/// using the existing mod library pipeline.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn deep_link_install_mod(
    url: String,
    name: Option<String>,
    author: Option<String>,
    source: Option<String>,
    app_handle: AppHandle,
    library: State<ModLibraryState>,
    settings: State<SettingsState>,
    patcher: State<PatcherState>,
) -> IpcResult<InstalledMod> {
    let result: AppResult<InstalledMod> = (|| {
        reject_if_patcher_running(&patcher)?;

        let parsed = url::Url::parse(&url)
            .map_err(|e| AppError::ValidationFailed(format!("Invalid URL: {e}")))?;
        if parsed.scheme() != "https" {
            return Err(AppError::ValidationFailed(
                "Download URL must use HTTPS".into(),
            ));
        }

        tracing::info!(
            "Protocol install: downloading from {} (name: {:?}, author: {:?}, source: {:?})",
            url,
            name,
            author,
            source
        );

        let temp_path = deep_link::download_mod_file(&url, &app_handle)?;
        let temp_path_str = temp_path.to_string_lossy().to_string();

        let config = settings.config()?;
        let result = library.0.install_mod_from_package(&config, &temp_path_str);

        if let Err(e) = std::fs::remove_file(&temp_path) {
            tracing::warn!("Failed to clean up temp file: {}", e);
        }

        deep_link::emit_install_complete(&app_handle);

        result
    })();
    result.into()
}
