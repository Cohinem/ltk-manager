//! Installation lifecycle for the external tool sections.

use ltk_manager_core::integrations::{
    self, IntegrationAction, IntegrationError, IntegrationRelease, IntegrationStatus, Integrations,
    MenuConflictPolicy, Tool,
};

use crate::error::{AppErrorResponse, IpcResult};

async fn run<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, IntegrationError> + Send + 'static,
) -> IpcResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or_else(|error| {
            Err(IntegrationError::Operation {
                detail: error.to_string(),
            })
        })
        .map_err(|error| AppErrorResponse::Integration { error })
        .into()
}

/// Local executable and Explorer state for each tool.
#[tauri::command]
#[specta::specta]
pub async fn integration_status() -> IpcResult<Vec<IntegrationStatus>> {
    run(|| Integrations::discover()?.status()).await
}

/// Latest stable release available for a tool.
#[tauri::command]
#[specta::specta]
pub async fn integration_release(tool: Tool) -> IpcResult<IntegrationRelease> {
    run(move || Integrations::discover()?.check_release(tool)).await
}

/// Apply an explicit installation or context-menu change.
#[tauri::command]
#[specta::specta]
pub async fn change_integration(
    tool: Tool,
    action: IntegrationAction,
    conflicts: MenuConflictPolicy,
) -> IpcResult<()> {
    run(move || Integrations::discover()?.change(tool, action, conflicts)).await
}

/// Cancel a matching download before registration begins.
#[tauri::command]
#[specta::specta]
pub fn cancel_integration_download(operation_id: String) -> IpcResult<()> {
    integrations::cancel_download(&operation_id);
    IpcResult::ok(())
}
