//! The desktop service: what the app and the machine it runs on are, the main window and the
//! tray, and the file explorer.

mod app;
mod platform;
pub(crate) mod shell;
mod storage;

pub use app::*;
pub use platform::*;
pub use shell::*;
pub use storage::*;

use tauri::plugin::TauriPlugin;
use tauri::{Manager, RunEvent, WindowEvent, Wry};

/// The desktop service's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the desktop commands, which shows the webview of the main window
/// whenever that window gains focus.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>()
        .on_event(|app, event| {
            // Covers every path that shows the window, including `show()` from the frontend.
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::Focused(true),
                ..
            } = event
            {
                if label != crate::MAIN_WINDOW {
                    return;
                }
                // The press that sends the window to the tray can report focus after the hide.
                if let Some(window) = app.get_webview_window(label) {
                    if window.is_visible().unwrap_or(false) {
                        let _ = shell::show_webview(&window);
                    }
                }
            }
        })
        .build()
}
