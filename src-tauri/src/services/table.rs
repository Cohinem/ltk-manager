// Every IPC service and the commands it answers, as its module, its plugin name and its
// commands. `build.rs` reads this for the permissions, and `services` for the handlers and the
// bindings, so the two cannot drift. ADR-0059.
services! {
    bin("bin") {
        // A document's lifetime
        bin_open,
        bin_open_variant,
        bin_save,
        bin_reload,
        bin_close,
        // Reads
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
        // Edits
        bin_edit,
        bin_history,
        bin_changes,
        bin_revert,
        // Declarations
        bin_declared,
        bin_overrides,
        bin_set_declaring,
        bin_declare_into,
        bin_row_declaration,
        declarations_module_action,
    }
    app_update("app-update") {
        check_update,
        download_update,
        install_update,
        discard_update,
    }
    game("game") {
        // Game index
        get_game_index,
        read_game_dir,
        refresh_game_index,
        search_game_index,
        find_in_game_index,
        locate_game_files,
        // Game WADs
        get_game_wads,
        read_game_wad,
        // Extract to disk
        plan_game_extract,
        extract_game_files,
        cancel_extract,
        // Hashtables
        get_hashtable_cache_status,
        check_hashtable_updates,
        sync_hashtables,
        // Strings
        search_string_keys,
        lookup_string_values,
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
    objects("objects") {
        warm_object_index,
        drop_object_index,
        search_object_index,
        find_objects,
        object_dir,
        character_spells,
        class_object_count,
        declared_objects,
        find_references,
        cancel_reference_walk,
    }
    workshop("workshop") {
        // Projects
        get_workshop_projects,
        get_workshop_project,
        create_project,
        edit_project,
        rename_workshop_project,
        delete_workshop_project,
        pack_workshop_project,
        peek_fantome,
        validate_project,
        get_project_thumbnail,
        get_project_content_tree,
        // Layers
        get_layer_content_path,
        get_layer_info,
        add_files_to_layer,
        delete_layer_content,
        watch_project_layers,
        unwatch_project_layers,
        // Opened folders
        inspect_project_folder,
        open_project_folder,
        record_project_opened,
        get_opened_project_folders,
        forget_project_folder,
        relocate_project_folder,
        convert_folder_to_project,
        add_project_folders,
        // Text files
        get_project_ignore_rules,
        recommended_ignore_rules,
        save_project_ignore_rules,
        add_recommended_ignore_rules,
        get_project_text,
        save_project_text,
        get_project_editor_state,
        save_project_editor_state,
        declarations_outline,
        // Problems
        analyze_project,
        fix_problems,
    }
}
