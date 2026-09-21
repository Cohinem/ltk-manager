use serde::{Deserialize, Serialize};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const TRAY_ID: &str = "main-tray";

// states, profiles and workshop
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AppTrayState {
    Default,
    LibraryLoading,
    LibraryOn,
    WorkshopLoading,
    WorkshopOn,
}

pub fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    let tray_menu = menu(app, None)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("LTK Manager")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => reveal(app),
            "update" => {
                reveal(app);
                let _ = app.emit(crate::updater::REQUESTED_EVENT, ());
            }
            "quit" => {
                crate::updater::install_on_quit(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The tray menu, led by an entry for `update` when a release is on offer.
fn menu<R: Runtime, M: Manager<R>>(manager: &M, update: Option<&str>) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(manager)?;
    if let Some(version) = update {
        let label = format!("Update to v{version}");
        menu.append(&MenuItem::with_id(
            manager,
            "update",
            label,
            true,
            None::<&str>,
        )?)?;
        menu.append(&PredefinedMenuItem::separator(manager)?)?;
    }
    menu.append(&MenuItem::with_id(
        manager,
        "show",
        "Show Manager",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        manager,
        "quit",
        "Quit",
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

/// Rebuild the tray menu for the release on offer, or for none.
pub fn show_update(app: &AppHandle, version: Option<&str>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let rebuilt = menu(app, version).and_then(|menu| tray.set_menu(Some(menu)));
    if let Err(error) = rebuilt {
        tracing::warn!(%error, "The tray menu could not be rebuilt");
    }
}

#[tauri::command]
pub fn set_tray_state(app: tauri::AppHandle, state: AppTrayState) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("Tray not found")?;

    let (icon_bytes, tooltip) = match state {
        AppTrayState::Default => (None, "LTK Manager"),
        AppTrayState::LibraryLoading => (
            Some(include_bytes!("../icons/icon_load.png").as_slice()),
            "LTK Manager - Building Profile...",
        ),
        AppTrayState::LibraryOn => (
            Some(include_bytes!("../icons/icon_on.png").as_slice()),
            "LTK Manager - Profile Patched",
        ),
        // workshop solution if someone changed their mind :P
        AppTrayState::WorkshopLoading => (
            Some(include_bytes!("../icons/icon_load.png").as_slice()),
            "LTK Manager - Workshop Building...",
        ),
        AppTrayState::WorkshopOn => (
            Some(include_bytes!("../icons/icon_on.png").as_slice()),
            "LTK Manager - Workshop Patched",
        ),
    };
    // apply icon
    if let Some(bytes) = icon_bytes {
        let img = image::load_from_memory(bytes)
            .map_err(|e| e.to_string())?
            .into_rgba8();

        let (width, height) = img.dimensions();

        let icon_image = Image::new_owned(img.into_raw(), width, height);

        tray.set_icon(Some(icon_image)).map_err(|e| e.to_string())?;
    } else {
        let default_icon = app
            .default_window_icon()
            .cloned()
            .ok_or("No default icon")?;
        tray.set_icon(Some(default_icon))
            .map_err(|e| e.to_string())?;
    }
    let _ = tray.set_tooltip(Some(tooltip));

    Ok(())
}
