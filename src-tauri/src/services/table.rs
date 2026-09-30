// Every IPC service and the commands it answers, as its module, its plugin name and its
// commands. `build.rs` reads this for the permissions, and `services` for the handlers and the
// bindings, so the two cannot drift. ADR-0059.
services! {
    app_update("app-update") {
        check_update,
        download_update,
        install_update,
        discard_update,
    }
    library("library") {
        // Mods
        get_installed_mods,
        install_mod,
        install_mods,
        update_mod,
        uninstall_mod,
        toggle_mod,
        reorder_mods,
        set_mod_layers,
        enable_mod_with_layers,
        edit_mod_metadata,
        set_mod_storage,
        export_mods,
        get_mod_thumbnail,
        get_mod_thumbnails,
        get_mod_readme,
        get_mod_license_text,
        get_storage_directory,
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
        // Profiles
        list_mod_profiles,
        get_active_mod_profile,
        create_mod_profile,
        delete_mod_profile,
        switch_mod_profile,
        rename_mod_profile,
        // Health
        check_mod_health,
        sweep_mod_health,
        repair_mod,
        repair_mods,
        cancel_mod_health_run,
        get_health_check_readiness,
        get_health_sweep,
        get_mod_health_verdicts,
        // Migration
        get_layout_migration_state,
        scan_cslol_mods,
        import_cslol_mods,
        ;
        debug: time_mod_health,
    }
}
