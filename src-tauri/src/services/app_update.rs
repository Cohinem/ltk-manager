//! The app-update service: the check, the download and the install of the app's own release.
//! ADR-0046.
//!
//! Named apart from `tauri-plugin-updater`, which already holds the plugin name `updater`.

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent, Wry};

use crate::error::IpcResult;
use crate::updater::{self, PendingUpdate, UpdaterState};

/// The app-update row of `services/table.rs`.
pub struct Table;

/// The plugin answering the app-update commands, holding the update on offer and running a
/// downloaded installer as the main window closes.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>()
        .setup(|app, _api| {
            app.manage(UpdaterState::default());
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { .. },
                ..
            } = event
            {
                if label == crate::MAIN_WINDOW {
                    updater::install_on_quit(app);
                }
            }
        })
        .build()
}

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
