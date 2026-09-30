//! The command table, and the bindings `tauri-specta` generates out of it (ADR-0029).

use tauri::ipc::Invoke;
use tauri::Wry;
use tauri_specta::{collect_commands, Builder, Commands};

/// Every command the frontend can call, with the ones only a debug build answers after `debug:`.
///
/// `collect_commands!` takes no attributes, so a debug-only command cannot carry its own `cfg`.
macro_rules! command_table {
    ($($name:ident),* $(,)? ; debug: $($debug:ident),* $(,)?) => {
        #[cfg(not(debug_assertions))]
        fn commands() -> Commands<Wry> {
            collect_commands![$(crate::commands::$name),*]
        }

        #[cfg(debug_assertions)]
        fn commands() -> Commands<Wry> {
            collect_commands![$(crate::commands::$name,)* $(crate::commands::$debug),*]
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
    // Mods
    get_installed_mods,
    install_mod,
    update_mod,
    install_mods,
    uninstall_mod,
    toggle_mod,
    set_mod_layers,
    enable_mod_with_layers,
    edit_mod_metadata,
    set_mod_storage,
    check_mod_health,
    repair_mod,
    repair_mods,
    get_mod_health_verdicts,
    cancel_mod_health_run,
    get_health_sweep,
    sweep_mod_health,
    get_health_check_readiness,
    export_mods,
    get_mod_thumbnail,
    get_mod_thumbnails,
    get_mod_readme,
    get_mod_license_text,
    get_storage_directory,
    reorder_mods,
    get_all_mod_wad_reports,
    analyze_mod_wads,
    // Folders
    get_folders,
    get_folder_order,
    create_folder,
    rename_folder,
    delete_folder,
    move_mod_to_folder,
    toggle_folder,
    reorder_folder_mods,
    reorder_folders,
    // Migration
    scan_cslol_mods,
    import_cslol_mods,
    get_layout_migration_state,
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
    // Profiles
    list_mod_profiles,
    get_active_mod_profile,
    create_mod_profile,
    delete_mod_profile,
    switch_mod_profile,
    rename_mod_profile,
    // Shell
    reveal_in_explorer,
    minimize_to_tray,
    // Storage
    detect_storage_medium,
    // Workshop
    get_workshop_projects,
    create_workshop_project,
    get_workshop_project,
    get_project_content_tree,
    save_project_config,
    rename_workshop_project,
    delete_workshop_project,
    pack_workshop_project,
    import_from_modpkg,
    peek_fantome,
    import_from_fantome,
    import_from_git_repo,
    validate_project,
    set_project_thumbnail,
    remove_project_thumbnail,
    get_project_thumbnail,
    save_layer_string_overrides,
    search_string_keys,
    lookup_string_values,
    get_layer_content_path,
    get_layer_info,
    create_project_layer,
    rename_project_layer,
    delete_project_layer,
    reorder_project_layers,
    update_layer_description,
    add_files_to_layer,
    delete_layer_content,
    get_project_editor_state,
    save_project_editor_state,
    // Problems
    analyze_project,
    fix_problems,
    // Hashtables
    get_hashtable_cache_status,
    check_hashtable_updates,
    sync_hashtables,
    // Game WADs
    get_game_wads,
    read_game_wad,
    // Game index
    get_game_index,
    read_game_dir,
    refresh_game_index,
    search_game_index,
    find_in_game_index,
    // Extract to disk
    plan_game_extract,
    extract_game_files,
    cancel_extract,
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
    // Bin editor: a document's lifetime
    bin_open,
    bin_open_variant,
    bin_save,
    bin_reload,
    bin_close,
    // Bin editor: reads
    bin_roots,
    bin_children,
    bin_read,
    bin_find,
    bin_dependencies,
    bin_choices,
    bin_copy_value,
    class_schema,
    derived_classes,
    class_docs,
    sync_meta_docs,
    // Bin editor: edits
    bin_edit,
    bin_undo,
    bin_redo,
    bin_changes,
    bin_revert,
    // Bin editor: declarations
    bin_declared,
    bin_overrides,
    bin_set_declaring,
    bin_declare_into,
    bin_row_declaration,
    declarations_module_action,
    // Object index
    locate_game_files,
    search_game_paths,
    warm_object_index,
    drop_object_index,
    search_object_index,
    declared_objects,
    object_dir,
    character_spells,
    read_spell,
    find_objects,
    class_object_count,
    find_references,
    cancel_reference_walk,
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
    // Workshop folders
    inspect_project_folder,
    open_project_folder,
    record_project_opened,
    get_opened_project_folders,
    forget_project_folder,
    relocate_project_folder,
    convert_folder_to_project,
    add_project_folders,
    watch_project_layers,
    unwatch_project_layers,
    // Workshop ignore rules
    get_project_ignore_rules,
    recommended_ignore_rules,
    save_project_ignore_rules,
    add_recommended_ignore_rules,
    get_project_text,
    save_project_text,
    // Workshop declarations
    declarations_outline,
    // Launcher
    check_install_mismatch,
    switch_league_install,
    // Updater
    check_update,
    download_update,
    install_update,
    discard_update,
    ;
    debug:
    time_mod_health,
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

/// The handler that answers every command.
pub fn invoke_handler() -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static {
    /* The handler's type captures the borrow, though its body only clones an `Arc`.
    Leaked rather than held, because the app outlives every scope in `main`. */
    let builder: &'static Builder<Wry> = Box::leak(Box::new(builder()));
    builder.invoke_handler()
}

#[cfg(test)]
mod tests;
