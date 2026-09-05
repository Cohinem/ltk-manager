//! Unit tests for the content scan: the walk over a layer, the tree over a
//! project, and the objects a layer's bins declare.

use super::*;
use crate::events::NullEventSink;
use ltk_hash::Hash as _;
use ltk_meta::path::PropertyPath;
use ltk_meta::property::NoMeta;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, BinOverride, PropertyPatch};
use std::fs;
use std::io::Cursor;
use std::sync::Arc;

fn touch(path: &Path, contents: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, contents).unwrap();
}

/// A `PROP` declaring `objects`, each as `(object path, class name)`.
fn prop(objects: &[(&str, &str)]) -> Vec<u8> {
    let bin = Bin::<NoMeta>::new(
        objects
            .iter()
            .map(|(path, class)| BinObject::new(BinHash::hash_str(path), BinHash::hash_str(class))),
        std::iter::empty::<&str>(),
    );
    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

/// A `PTCH` adding `objects` and carrying one patch record on `patched`.
fn patch(objects: &[(&str, &str)], patched: &str) -> Vec<u8> {
    let mut bin = BinOverride::<NoMeta>::new();
    for (path, class) in objects {
        let object = BinObject::new(BinHash::hash_str(path), BinHash::hash_str(class));
        bin.objects.insert(object.path_hash, object);
    }
    bin.patches.push(PropertyPatch::new(
        BinHash::hash_str(patched),
        PropertyPath::new("mValue").unwrap(),
        values::U32::new(2),
    ));
    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

/// The layer under `dir` as the frontend lists it, named through no table.
fn listed(dir: &Path, name: &str) -> LayerContent {
    scan_layer(dir, name)
        .unwrap()
        .named(&ResolvedNames::default())
}

#[test]
fn scan_layer_empty_dir() {
    let dir = tempfile::tempdir().unwrap();
    let layer = listed(dir.path(), "base");
    assert_eq!(layer.file_count, 0);
    assert_eq!(layer.total_size_bytes, 0);
    assert!(layer.entries.is_empty());
}

#[test]
fn scan_layer_classifies_known_extensions() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("assets/tex/skin.dds"), b"DDS content");
    touch(&dir.path().join("data/config.bin"), b"bin content");
    touch(&dir.path().join("mystery.xyz"), b"?");

    let layer = listed(dir.path(), "base");
    assert_eq!(layer.entries.len(), 3);

    let by_path: std::collections::HashMap<_, _> = layer
        .entries
        .iter()
        .map(|e| (e.relative_path.clone(), e.kind))
        .collect();
    assert!(matches!(
        by_path["assets/tex/skin.dds"],
        WorkshopFileKind::TextureDds
    ));
    assert!(matches!(
        by_path["data/config.bin"],
        WorkshopFileKind::PropertyBin
    ));
    assert!(matches!(by_path["mystery.xyz"], WorkshopFileKind::Unknown));
}

#[test]
fn scan_layer_skips_dotfiles() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join(".DS_Store"), b"junk");
    touch(&dir.path().join("visible.png"), b"png");

    let layer = listed(dir.path(), "base");
    assert_eq!(layer.entries.len(), 1);
    assert_eq!(layer.entries[0].relative_path, "visible.png");
}

#[test]
fn scan_layer_returns_every_file() {
    let dir = tempfile::tempdir().unwrap();
    for i in 0..50 {
        touch(&dir.path().join(format!("file_{i}.bin")), b"xx");
    }

    let layer = listed(dir.path(), "base");
    assert_eq!(layer.file_count, 50);
    assert_eq!(layer.entries.len(), 50);
    assert_eq!(layer.total_size_bytes, 100);
}

#[test]
fn scan_layer_sorts_entries_by_path() {
    let dir = tempfile::tempdir().unwrap();
    touch(&dir.path().join("z.bin"), b"");
    touch(&dir.path().join("a.bin"), b"");
    touch(&dir.path().join("m/n.bin"), b"");

    let layer = listed(dir.path(), "base");
    let paths: Vec<_> = layer
        .entries
        .iter()
        .map(|e| e.relative_path.as_str())
        .collect();
    assert_eq!(paths, vec!["a.bin", "m/n.bin", "z.bin"]);
}

#[test]
fn content_tree_orders_base_first() {
    let project_dir = tempfile::tempdir().unwrap();
    let content = project_dir.path().join("content");
    fs::create_dir_all(content.join("zeta")).unwrap();
    fs::create_dir_all(content.join("alpha")).unwrap();
    fs::create_dir_all(content.join("base")).unwrap();
    touch(&content.join("base/a.bin"), b"");
    touch(&content.join("alpha/a.bin"), b"");
    touch(&content.join("zeta/a.bin"), b"");

    let workshop = Workshop::new(Arc::new(NullEventSink));
    let tree = workshop
        .get_project_content_tree(project_dir.path().to_str().unwrap())
        .unwrap();

    let names: Vec<&str> = tree.layers.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, ["base", "alpha", "zeta"]);
}

#[test]
fn a_layer_bin_carries_its_objects_and_every_other_file_none() {
    let project_dir = tempfile::tempdir().unwrap();
    let content = project_dir.path().join("content");
    touch(
        &content.join("base/data/skin0.bin"),
        &prop(&[
            (
                "characters/aatrox/skins/skin0",
                "SkinCharacterDataProperties",
            ),
            (
                "characters/aatrox/skins/skin0/resources",
                "ResourceResolver",
            ),
        ]),
    );
    touch(
        &content.join("base/data/patch.bin"),
        &patch(
            &[(
                "characters/aatrox/skins/skin0/added",
                "VfxSystemDefinitionData",
            )],
            "characters/aatrox/skins/skin0",
        ),
    );
    touch(&content.join("base/data/broken.bin"), b"PROP garbage");
    touch(&content.join("base/assets/skin0.dds"), b"DDS content");

    let workshop = Workshop::new(Arc::new(NullEventSink));
    let tree = workshop
        .get_project_content_tree(project_dir.path().to_str().unwrap())
        .unwrap();
    let base = &tree.layers[0];
    let objects = |path: &str| -> Vec<(String, String, String)> {
        base.entries
            .iter()
            .find(|entry| entry.relative_path == path)
            .unwrap()
            .objects
            .iter()
            .map(|object| {
                (
                    object.object_hash.clone(),
                    object.path.clone(),
                    object.class.clone(),
                )
            })
            .collect()
    };

    let skin0 = objects("data/skin0.bin");
    assert_eq!(skin0.len(), 2, "one row per object, in file order");
    assert_eq!(
        skin0[0].0,
        hex(BinHash::hash_str("characters/aatrox/skins/skin0"))
    );
    assert_eq!(
        skin0[1].0,
        hex(BinHash::hash_str("characters/aatrox/skins/skin0/resources"))
    );
    /* The machine running this may or may not hold a synced cache, so a name
    is either the table's or the hash's, and never empty. */
    for (hash, path, class) in &skin0 {
        assert!(!path.is_empty() && !class.is_empty());
        assert!(path == hash || !path.starts_with("0x"));
    }

    let patched = objects("data/patch.bin");
    assert_eq!(
        patched
            .iter()
            .map(|(hash, _, _)| hash.as_str())
            .collect::<Vec<_>>(),
        [hex(BinHash::hash_str(
            "characters/aatrox/skins/skin0/added"
        ))],
        "a patch's added objects are rows, and its patch record is not"
    );

    assert!(
        objects("data/broken.bin").is_empty(),
        "a bin that will not read"
    );
    assert!(objects("assets/skin0.dds").is_empty(), "not a bin");
    assert_eq!(base.file_count, 4);
}
