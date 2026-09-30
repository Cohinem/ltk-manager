//! The commands no service owns yet, and the bindings `tauri-specta` generates out of them and
//! every service's types (ADR-0029, ADR-0059).

use std::collections::BTreeMap;

use tauri::ipc::Invoke;
use tauri::Wry;
use tauri_specta::{collect_commands, Builder, Commands};

/// Every command the frontend reaches outside a service.
macro_rules! command_table {
    ($($name:ident),* $(,)?) => {
        const COMMANDS: &[&str] = &[$(stringify!($name)),*];

        fn commands() -> Commands<Wry> {
            collect_commands![$(crate::commands::$name),*]
        }
    };
}

command_table![
    // App
    get_app_info,
    get_platform_support,
    show_main_window,
    // Settings
    get_settings,
    save_settings,
    get_default_settings,
    auto_detect_league_path,
    validate_league_path,
    check_setup_required,
    detect_league_run_as_admin,
    list_available_wads,
    list_forcible_map_skins,
    list_map_decorations,
    // Patcher
    start_patcher,
    stop_patcher,
    rebuild_overlay,
    get_patcher_status,
    get_linked_bin_offenders,
    get_checksum_mismatches,
    // Launcher
    launch_league,
    cancel_launch,
    stop_league,
    get_launch_availability,
    get_league_session,
    // Hotkeys
    pause_hotkeys,
    resume_hotkeys,
    set_hotkey,
    // Shell
    reveal_in_explorer,
    minimize_to_tray,
    // Storage
    detect_storage_medium,
    // Asset preview
    read_asset_info,
    save_asset_copy,
    // Ritobin
    detect_ritobin_integration,
    open_asset_in_ritobin,
    // Deep Link
    deep_link_install_mod,
    take_pending_deep_link,
    // Releases
    list_releases,
    // News
    list_announcements,
    list_notices,
    integration_status,
    integration_release,
    change_integration,
    cancel_integration_download,
    // Object index
    read_spell,
    // Particle renderer
    read_vfx_system,
    vfx_templates,
    // Skin preview
    read_skin,
    read_material_programs,
    read_embedded_material_program,
    read_default_skinned_program,
    read_particle_program,
    bake_skin_tangents,
    read_map,
    read_map_particles,
    read_map_characters,
    read_map_variants,
    read_map_outline,
    locate_map_files,
    locate_files_near,
    read_animation_graph,
    read_clip_header,
    // Atlas
    read_ui_view,
    read_ui_scene_view,
    read_ui_font,
    read_ui_font_catalog,
    read_ui_material_programs,
    read_ui_programs,
    read_ui_loadout,
    atlas_export_sprite,
    atlas_import_font_file,
    atlas_import_sprite,
    atlas_make_surface,
    atlas_patch_sprite,
    atlas_sheet,
    // Diagnostics
    run_diagnostics,
    open_elevated_terminal,
    list_incidents,
    dismiss_incident,
    dismiss_all_incidents,
    reveal_game_log,
    incident_report,
    incident_token,
    decode_incident_token,
    telemetry_identity,
    reset_telemetry_secret,
    track_ui_error,
    // Launcher
    check_install_mismatch,
    switch_league_install,
];

/// The builder the bindings are generated from and the handler is built out of.
fn builder() -> Builder<Wry> {
    use ltk_manager_core::diagnostics::incident::Incident;
    use ltk_manager_core::events::{
        ExportProgress, ExtractProgress, FantomeImportProgress, GitImportProgress,
        HashtableSyncProgress, HealthSweepProgress, InstallProgress, LayoutMigrationProgress,
        MigrationProgress, ModRepairProgress, ModStorageProgress, OverlayProgress,
    };
    use ltk_manager_core::launcher::{
        LaunchProgress, SessionChanged, SessionEnded, SessionGameRunning, SessionStarted,
    };
    use ltk_manager_core::mods::LayoutMigrationReport;
    use ltk_manager_core::object_index::ReferenceWalkProgress;
    use ltk_manager_core::workshop::LayerFilesChanged;

    use crate::deep_link::{
        DeepLinkInstallRequest, DeepLinkSettingsRequest, ProtocolInstallProgress,
    };
    use crate::patcher::thread::{
        GameAttachedPayload, GameOverlayPayload, LinkedBinWarningPayload, WadScanFailedPayload,
    };

    /* A 64-bit integer crosses as a JS number. None reaches the range where that loses
    a digit, and `JSON.stringify` refuses a `bigint`. */
    Builder::<Wry>::new()
        .commands(commands())
        .constant(COMMAND_NAMES, command_names(None, COMMANDS))
        .types(&crate::services::types())
        // Event payloads, which no command signature reaches.
        .typ::<ExportProgress>()
        .typ::<ExtractProgress>()
        .typ::<FantomeImportProgress>()
        .typ::<GitImportProgress>()
        .typ::<HashtableSyncProgress>()
        .typ::<HealthSweepProgress>()
        .typ::<InstallProgress>()
        .typ::<LayoutMigrationProgress>()
        .typ::<MigrationProgress>()
        .typ::<ModRepairProgress>()
        .typ::<ModStorageProgress>()
        .typ::<OverlayProgress>()
        .typ::<Incident>()
        .typ::<LaunchProgress>()
        .typ::<SessionStarted>()
        .typ::<SessionChanged>()
        .typ::<SessionGameRunning>()
        .typ::<SessionEnded>()
        .typ::<LayoutMigrationReport>()
        .typ::<ReferenceWalkProgress>()
        .typ::<LayerFilesChanged>()
        .typ::<DeepLinkInstallRequest>()
        .typ::<DeepLinkSettingsRequest>()
        .typ::<ProtocolInstallProgress>()
        .typ::<GameAttachedPayload>()
        .typ::<GameOverlayPayload>()
        .typ::<LinkedBinWarningPayload>()
        .typ::<WadScanFailedPayload>()
        .dangerously_cast_bigints_to_number()
}

/// The constant each generated file names its commands' invoke names under.
pub(crate) const COMMAND_NAMES: &str = "commandNames";

/// The name each of `commands` is invoked under, keyed by its generated function: the command
/// itself, or `plugin:<plugin>|<command>` for a service's.
pub(crate) fn command_names(plugin: Option<&str>, commands: &[&str]) -> BTreeMap<String, String> {
    commands
        .iter()
        .map(|command| {
            let invoked = match plugin {
                Some(plugin) => format!("plugin:{plugin}|{command}"),
                None => (*command).to_owned(),
            };
            (lower_camel(command), invoked)
        })
        .collect()
}

/// `get_installed_mods` as `getInstalledMods`, the key `tauri-specta` gives its function, and
/// `app-update` as `appUpdate`.
fn lower_camel(text: &str) -> String {
    let mut parts = text.split(['_', '-']);
    let head = parts.next().unwrap_or_default().to_owned();
    parts.fold(head, |mut name, part| {
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            name.extend(first.to_uppercase());
            name.push_str(chars.as_str());
        }
        name
    })
}

/// The handler that answers every command outside a service.
pub fn invoke_handler() -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
    handler(builder())
}

/// The handler that answers the commands of `builder`.
pub(crate) fn handler(
    builder: Builder<Wry>,
) -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
    /* The handler's type captures the borrow, though its body only clones an `Arc`.
    Leaked rather than held, because the app outlives every scope in `main`. */
    let builder: &'static Builder<Wry> = Box::leak(Box::new(builder));
    builder.invoke_handler()
}

#[cfg(test)]
mod tests;
