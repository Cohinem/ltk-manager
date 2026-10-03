use std::path::PathBuf;

use super::*;

fn content() -> PathBuf {
    PathBuf::from("projects").join("smolder").join("content")
}

fn file(layer: &str, path: &str) -> LayerFile {
    LayerFile {
        layer: layer.to_owned(),
        path: path.to_owned(),
    }
}

#[test]
fn a_path_inside_a_layer_names_the_layer_and_a_forward_slash_path() {
    let path = content()
        .join("base")
        .join("smolder.wad.client")
        .join("assets")
        .join("icon.tex");

    assert_eq!(
        LayerFile::at(&content(), &path),
        Some(file("base", "smolder.wad.client/assets/icon.tex"))
    );
}

#[test]
fn the_layer_directory_itself_is_no_layer_file() {
    assert_eq!(LayerFile::at(&content(), &content().join("base")), None);
    assert_eq!(LayerFile::at(&content(), &content()), None);
}

#[test]
fn a_path_outside_content_is_no_layer_file() {
    let config = PathBuf::from("projects")
        .join("smolder")
        .join("mod.config.json");
    let elsewhere = PathBuf::from("other").join("base").join("icon.tex");

    assert_eq!(LayerFile::at(&content(), &config), None);
    assert_eq!(LayerFile::at(&content(), &elsewhere), None);
}

#[test]
fn a_burst_of_saves_collects_each_file_once_in_order() {
    let icon = content().join("base").join("icon.tex");
    let temp = content().join("base").join("icon.tex~");
    let skin = content().join("chroma").join("skin.dds");
    let config = PathBuf::from("projects")
        .join("smolder")
        .join("mod.config.json");
    let paths = [&skin, &temp, &icon, &icon, &config];

    let change = LayerFilesChanged::collect(
        "C:/projects/smolder",
        &content(),
        paths.map(PathBuf::as_path),
    );

    assert_eq!(
        change,
        Some(LayerFilesChanged {
            project: "C:/projects/smolder".to_owned(),
            files: vec![
                file("base", "icon.tex"),
                file("base", "icon.tex~"),
                file("chroma", "skin.dds"),
            ],
        })
    );
}

#[test]
fn paths_that_name_no_layer_file_collect_nothing() {
    let config = PathBuf::from("projects")
        .join("smolder")
        .join("mod.config.json");
    let layer = content().join("base");

    let change =
        LayerFilesChanged::collect("projects/smolder", &content(), [config.as_path(), &layer]);

    assert_eq!(change, None);
}

#[test]
fn the_payload_is_the_shape_the_frontend_reads() {
    let change = LayerFilesChanged {
        project: "C:/projects/smolder".to_owned(),
        files: vec![file("base", "icon.tex")],
    };

    assert_eq!(
        serde_json::to_value(&change).unwrap(),
        serde_json::json!({
            "project": "C:/projects/smolder",
            "files": [{ "layer": "base", "path": "icon.tex" }],
        })
    );
}
