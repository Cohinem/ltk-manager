use super::*;
use assert_matches::assert_matches;
use fs_err as fs;
use ltk_declarations::{Edit, ModuleChoice, Operation, ValueText};

fn project(dir: &std::path::Path) -> ProjectDir {
    fs::create_dir_all(dir.join("content").join("base")).unwrap();
    ProjectDir::open(dir.display().to_string()).unwrap()
}

#[test]
fn a_layer_name_that_is_not_one_component_is_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let project = project(tmp.path());

    assert_matches!(
        project.declarations_manifest("../base"),
        Err(AppError::ValidationFailed(_))
    );
    assert_matches!(
        project.declarations_manifest(".."),
        Err(AppError::ValidationFailed(_))
    );
}

/// A project with one layer per name, written so `config()` reads them.
fn project_with_layers(dir: &std::path::Path, layers: &[&str]) -> ProjectDir {
    let layers: Vec<String> = layers
        .iter()
        .enumerate()
        .map(|(priority, name)| {
            fs::create_dir_all(dir.join("content").join(name)).unwrap();
            format!(r#"{{"name": "{name}", "priority": {priority}}}"#)
        })
        .collect();
    fs::write(
        dir.join("mod.config.json"),
        format!(
            r#"{{"name": "m", "display_name": "M", "version": "1.0.0", "description": "", "authors": [], "layers": [{}]}}"#,
            layers.join(",")
        ),
    )
    .unwrap();

    ProjectDir::open(dir.display().to_string()).unwrap()
}

#[test]
fn convert_manifests_reports_converted_and_failed_layers_apart() {
    let tmp = tempfile::tempdir().unwrap();
    let project = project_with_layers(tmp.path(), &["base", "broken", "clean"]);
    let content = tmp.path().join("content");
    fs::write(
        content.join("base/game_data.json"),
        r#"{"version": 1, "modules": []}"#,
    )
    .unwrap();
    fs::write(content.join("broken/game_data.json"), "not json").unwrap();
    fs::write(
        content.join("clean/game_data.yaml"),
        "version: 1\nmodules: []\n",
    )
    .unwrap();

    let report = project.convert_manifests();

    assert_eq!(report.converted, ["base"]);
    assert_eq!(report.failed.len(), 1);
    assert_eq!(report.failed[0].layer, "broken");
    assert!(content.join("base/game_data.yaml").exists());
    assert!(!content.join("base/game_data.json").exists());
    assert!(content.join("broken/game_data.json").exists());
    assert!(project.declarations_manifest("base").is_ok());
}

#[test]
fn convert_manifests_reports_nothing_on_a_second_run() {
    let tmp = tempfile::tempdir().unwrap();
    let project = project_with_layers(tmp.path(), &["base"]);
    fs::write(
        tmp.path().join("content/base/game_data.toml"),
        "version = 1\nmodules = []\n",
    )
    .unwrap();

    assert_eq!(project.convert_manifests().converted, ["base"]);
    assert_eq!(project.convert_manifests(), ManifestConversions::default());
}

#[test]
fn a_manifest_changed_on_disk_surfaces_as_its_workshop_error() {
    let tmp = tempfile::tempdir().unwrap();
    let project = project(tmp.path());
    let mut manifest = project.declarations_manifest("base").unwrap();
    manifest
        .edit(&Edit {
            chunk_hash: ltk_game_data::path_hash("data/characters/teemo/skins/skin0.bin"),
            entry: "Characters/Teemo/Skins/Skin0".try_into().unwrap(),
            path: "iconCircle".parse().unwrap(),
            operation: Operation::Set(ValueText::new("a.tex").unwrap()),
            module: ModuleChoice::Auto,
        })
        .unwrap();
    fs::write(manifest.path(), "version: 1\nmodules: []\n").unwrap();

    let result = manifest.write().map_err(declarations_error);

    assert_matches!(
        result.as_ref().map_err(AppError::domain::<WorkshopError>),
        Err(Some(WorkshopError::DeclarationsChangedOnDisk { path }))
            if path.ends_with("game_data.yaml")
    );
}

#[test]
fn a_created_module_is_written_and_loads_with_no_entry() {
    let tmp = tempfile::tempdir().unwrap();
    let project = project(tmp.path());

    let change = project
        .apply_module_action(
            "base",
            &ModuleAction::Create {
                name: Some("Particles".to_owned()),
            },
        )
        .unwrap();

    assert_eq!(
        change.map(|change| change.after),
        Some("version: 1\nmodules:\n  - name: Particles\n    entries: {}\n".to_owned())
    );
    let manifest = project.declarations_manifest("base").unwrap();
    let declarations = manifest.declarations().unwrap().unwrap();
    assert_eq!(declarations.modules.len(), 1);
}
