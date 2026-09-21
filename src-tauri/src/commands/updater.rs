use tauri::{AppHandle, Manager};

use crate::error::IpcResult;
use crate::updater::{self, PendingUpdate, UpdaterState};

/// A release newer than the running build, or `None` when this build is the latest.
#[tauri::command]
#[specta::specta]
pub async fn check_update(app: AppHandle) -> IpcResult<Option<PendingUpdate>> {
    updater::check(&app).await.into()
}

/// Download the offered release's installer ahead of the install.
#[tauri::command]
#[specta::specta]
pub async fn download_update(app: AppHandle) -> IpcResult<()> {
    updater::download(&app).await.into()
}

/// Install the downloaded release and relaunch into it.
#[tauri::command]
#[specta::specta]
pub async fn install_update(app: AppHandle) -> IpcResult<()> {
    updater::install(&app).into()
}

/// Drop the downloaded installer, so quitting installs nothing.
#[tauri::command]
#[specta::specta]
pub fn discard_update(app: AppHandle) -> IpcResult<()> {
    app.state::<UpdaterState>().discard_installer();
    IpcResult::ok(())
}
