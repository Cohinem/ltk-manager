use std::path::Path;

use assert_matches::assert_matches;
use fs_err as fs;
use ltk_game_data::load_declarations;
use tempfile::TempDir;

use super::*;

const JSON_MANIFEST: &str = r#"{
  "version": 1,
  "modules": [
    {
      "name": "first",
      "entries": {
        "Characters/Aatrox": {"mass": 1.5, "title": "0x71ad094e", "flag": "true", "note": "1.0"},
        "0x71ad094e": {"count": 3}
      }
    }
  ]
}"#;

const JSON_MANIFEST_AS_YAML: &str = "version: 1
modules:
  - name: first
    entries:
      Characters/Aatrox:
        mass: 1.5
        title: '0x71ad094e'
        flag: 'true'
        note: '1.0'
      '0x71ad094e':
        count: 3
";

const TOML_MANIFEST: &str = r#"
version = 1

[[modules]]
target = "data/aatrox.bin"
"Characters/Aatrox" = { mass = 1.5 }
"#;

const TOML_MANIFEST_AS_YAML: &str = "version: 1
modules:
  - target: data/aatrox.bin
    Characters/Aatrox:
      mass: 1.5
";

fn layer(files: &[(&str, &str)]) -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (name, text) in files {
        let path = dir.path().join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }
    dir
}

/// Serialized declarations of a layer's manifest, read with no source. Fails if it does not load.
fn loaded(path: &Path) -> String {
    let text = fs::read_to_string(path).unwrap();
    let name = path.to_string_lossy();
    let declarations = load_declarations(&name, &text, |source| {
        fs::read_to_string(path.parent().unwrap().join(source))
            .map_err(|error| ltk_game_data::Error::io(source, &error))
    })
    .unwrap();

    let document = ltk_game_data::DeclarationDocument::try_from(declarations).unwrap();
    let value = serde_json::to_value(document).unwrap();
    strip_origins(value).to_string()
}

/// `value` with each module's `origin` removed, which names the file it was read from.
fn strip_origins(mut value: Value) -> Value {
    if let Some(modules) = value.get_mut("modules").and_then(Value::as_array_mut) {
        for module in modules {
            if let Some(module) = module.as_object_mut() {
                module.remove("origin");
            }
        }
    }
    value
}

/// The result of [`loaded`] for a layer of `files`, whose manifest is `game_data.yaml`.
fn loaded_from(files: &[(&str, &str)]) -> String {
    loaded(&layer(files).path().join("game_data.yaml"))
}

#[test]
fn convert_layer_replaces_json_manifest_with_equal_yaml() {
    let dir = layer(&[("game_data.json", JSON_MANIFEST)]);
    let expected = loaded_from(&[("game_data.yaml", JSON_MANIFEST_AS_YAML)]);

    let removed = convert_layer(dir.path()).unwrap();

    assert_eq!(removed, [dir.path().join("game_data.json")]);
    assert!(!dir.path().join("game_data.json").exists());
    assert_eq!(loaded(&dir.path().join("game_data.yaml")), expected);
}

#[test]
fn convert_layer_keeps_scalars_that_read_as_other_types_as_strings() {
    let dir = layer(&[("game_data.json", JSON_MANIFEST)]);

    convert_layer(dir.path()).unwrap();

    let text = fs::read_to_string(dir.path().join("game_data.yaml")).unwrap();
    let read: Value = serde_saphyr::from_str(&text).unwrap();
    let entry = &read["modules"][0]["entries"]["Characters/Aatrox"];
    assert_eq!(entry["title"], "0x71ad094e");
    assert_eq!(entry["flag"], "true");
    assert_eq!(entry["note"], "1.0");
    assert_eq!(entry["mass"], 1.5);
}

#[test]
fn convert_layer_replaces_toml_manifest_with_equal_yaml() {
    let dir = layer(&[("game_data.toml", TOML_MANIFEST)]);
    let expected = loaded_from(&[("game_data.yaml", TOML_MANIFEST_AS_YAML)]);

    convert_layer(dir.path()).unwrap();

    assert!(!dir.path().join("game_data.toml").exists());
    assert_eq!(loaded(&dir.path().join("game_data.yaml")), expected);
}

#[test]
fn convert_layer_keeps_entry_order() {
    let dir = layer(&[("game_data.json", JSON_MANIFEST)]);

    convert_layer(dir.path()).unwrap();

    let text = fs::read_to_string(dir.path().join("game_data.yaml")).unwrap();
    let first = text.find("Characters/Aatrox").unwrap();
    let second = text.find("0x71ad094e").unwrap();
    assert!(first < second, "{text}");
}

#[test]
fn convert_layer_converts_json_sources_of_json_manifest() {
    let manifest = r#"{"version": 1, "modules": [
        {"target": "data/a.bin", "source": "edits/a.json"}
    ]}"#;
    let dir = layer(&[
        ("game_data.json", manifest),
        (
            "edits/a.json",
            r#"{"version": 1, "Characters/Aatrox": {"mass": 2.0}}"#,
        ),
    ]);
    let expected = loaded_from(&[
        (
            "game_data.yaml",
            "version: 1\nmodules:\n  - target: data/a.bin\n    source: edits/a.yaml\n",
        ),
        (
            "edits/a.yaml",
            "version: 1\nCharacters/Aatrox:\n  mass: 2.0\n",
        ),
    ]);

    let removed = convert_layer(dir.path()).unwrap();

    assert_eq!(removed.len(), 2);
    assert!(!dir.path().join("edits/a.json").exists());
    assert!(dir.path().join("edits/a.yaml").exists());

    let text = fs::read_to_string(dir.path().join("game_data.yaml")).unwrap();
    assert!(text.contains("edits/a.yaml"), "{text}");
    assert_eq!(loaded(&dir.path().join("game_data.yaml")), expected);
}

#[test]
fn convert_layer_respells_sources_of_yaml_manifest_and_keeps_its_comments() {
    let manifest = "# Written by hand.\nversion: 1\nmodules:\n  - target: data/a.bin\n    source: 'edits/a.toml' # kept\n";
    let dir = layer(&[
        ("game_data.yaml", manifest),
        (
            "edits/a.toml",
            "version = 1\n\"Characters/Aatrox\" = { mass = 2.0 }\n",
        ),
    ]);

    let removed = convert_layer(dir.path()).unwrap();

    assert_eq!(removed.len(), 1);
    assert_eq!(
        fs::read_to_string(dir.path().join("game_data.yaml")).unwrap(),
        manifest.replace("a.toml", "a.yaml")
    );
    assert!(dir.path().join("edits/a.yaml").exists());
    assert!(!dir.path().join("edits/a.toml").exists());
}

#[test]
fn convert_layer_leaves_yaml_only_layer_unchanged() {
    let manifest = "version: 1\nmodules: []\n";
    let dir = layer(&[("game_data.yaml", manifest)]);

    let removed = convert_layer(dir.path()).unwrap();

    assert!(removed.is_empty());
    assert_eq!(
        fs::read_to_string(dir.path().join("game_data.yaml")).unwrap(),
        manifest
    );
}

#[test]
fn convert_layer_returns_nothing_for_layer_with_no_manifest() {
    let dir = layer(&[]);

    assert!(convert_layer(dir.path()).unwrap().is_empty());
}

#[test]
fn convert_layer_refuses_layer_with_two_manifests() {
    let dir = layer(&[
        ("game_data.json", JSON_MANIFEST),
        ("game_data.yaml", "version: 1\nmodules: []\n"),
    ]);

    assert_matches!(convert_layer(dir.path()), Err(Error::Invalid { .. }));
    assert!(dir.path().join("game_data.json").exists());
}

#[test]
fn convert_layer_leaves_invalid_manifest_in_place() {
    let dir = layer(&[("game_data.json", r#"{"version": 99, "modules": []}"#)]);

    assert_matches!(convert_layer(dir.path()), Err(Error::Invalid { .. }));
    assert!(dir.path().join("game_data.json").exists());
    assert!(!dir.path().join("game_data.yaml").exists());
}

#[test]
fn convert_layer_refuses_source_whose_yaml_name_exists() {
    let manifest = r#"{"version": 1, "modules": [{"target": "data/a.bin", "source": "a.json"}]}"#;
    let dir = layer(&[
        ("game_data.json", manifest),
        ("a.json", r#"{"Characters/Aatrox": {"mass": 2.0}}"#),
        ("a.yaml", "kept: true\n"),
    ]);

    assert_matches!(convert_layer(dir.path()), Err(Error::Invalid { .. }));
    assert!(dir.path().join("game_data.json").exists());
    assert_eq!(
        fs::read_to_string(dir.path().join("a.yaml")).unwrap(),
        "kept: true\n"
    );
}

#[test]
fn convert_layer_refuses_source_outside_layer() {
    let manifest =
        r#"{"version": 1, "modules": [{"target": "data/a.bin", "source": "../a.json"}]}"#;
    let outer = tempfile::tempdir().unwrap();
    fs::write(outer.path().join("a.json"), r#"{"E": {"m": 1.0}}"#).unwrap();
    let layer_dir = outer.path().join("base");
    fs::create_dir_all(&layer_dir).unwrap();
    fs::write(layer_dir.join("game_data.json"), manifest).unwrap();

    assert_matches!(convert_layer(&layer_dir), Err(Error::Invalid { .. }));
    assert!(outer.path().join("a.json").exists());
    assert!(layer_dir.join("game_data.json").exists());
}
