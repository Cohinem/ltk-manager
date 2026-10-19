use std::io::Cursor;

use ltk_meta::BinObject;
use ltk_meta::property::values;

use super::*;
use crate::map::fixtures::{document_of, h};

const BASE_SRX: &str = "Maps/MapGeometry/Map11/Base_SRX";
const CLASSIC: &str = "Maps/MapGeometry/Map11/classic";

fn skin(name: &str, container: Option<&str>) -> BinObject {
    let mut object =
        BinObject::builder(h(&format!("Maps/Shipping/Map11/MapSkins/{name}")), MAP_SKIN)
            .property(SKIN_NAME, values::String::from(name));
    if let Some(container) = container {
        object = object.property(CONTAINER_LINK, values::String::from(container));
    }
    object.build()
}

fn container(path: &str) -> BinObject {
    BinObject::builder(h(path), MAP_CONTAINER)
        .property(MAP_PATH, values::String::from(path))
        .build()
}

fn bytes_of(objects: Vec<BinObject>) -> Vec<u8> {
    let mut bin = Bin::builder();
    for object in objects {
        bin = bin.object(object);
    }
    let mut out = Cursor::new(Vec::new());
    bin.build().to_writer(&mut out).unwrap();
    out.into_inner()
}

#[test]
fn shipping_bin_path_lowers_map_id() {
    assert_eq!(
        shipping_bin_path("Map11"),
        "data/maps/shipping/map11/map11.bin"
    );
}

#[test]
fn map_skin_containers_lists_skins_that_link_a_container() {
    let document = document_of(vec![
        skin("Default", Some(BASE_SRX)),
        skin("Odyssey", None),
        skin("Bloom", Some("Maps/MapGeometry/Map11/Bloom")),
    ]);

    let skins = map_skin_containers(&document);

    assert_eq!(
        skins,
        vec![
            MapSkinContainer {
                skin: "Default".to_owned(),
                container: MapPath::from(BASE_SRX),
            },
            MapSkinContainer {
                skin: "Bloom".to_owned(),
                container: MapPath::from("Maps/MapGeometry/Map11/Bloom"),
            },
        ]
    );
}

#[test]
fn moved_container_rekeys_container_and_writes_map_path() {
    let material = BinObject::builder(
        h("Maps/MapGeometry/Map11/Base_SRX/Materials/Ground"),
        h("StaticMaterialDef"),
    )
    .build();
    let materials = bytes_of(vec![container(BASE_SRX), material]);

    let moved = moved_container(
        &materials,
        &MapPath::from(BASE_SRX),
        &MapPath::from(CLASSIC),
    )
    .unwrap();
    let document = BinDocument::parse(moved).unwrap();

    assert!(document.object_at(h(BASE_SRX)).is_none());
    let moved = document.object_at(h(CLASSIC)).unwrap();
    assert_eq!(text(moved.properties.get(&MAP_PATH)), Some(CLASSIC));
    assert!(
        document
            .object_at(h("Maps/MapGeometry/Map11/Base_SRX/Materials/Ground"))
            .is_some()
    );
}

#[test]
fn moved_container_fails_without_container() {
    let materials = bytes_of(vec![skin("Default", Some(BASE_SRX))]);

    assert!(
        moved_container(
            &materials,
            &MapPath::from(BASE_SRX),
            &MapPath::from(CLASSIC)
        )
        .is_err()
    );
}

#[test]
fn skin_link_declarations_links_every_skin_by_hash_without_names() {
    let document = document_of(vec![skin("Default", Some(BASE_SRX)), skin("Odyssey", None)]);

    let text = skin_link_declarations(
        &document,
        "data/maps/shipping/map11/map11.bin",
        &MapPath::from(CLASSIC),
        &(),
    );

    let default = HexBinHash::from(h("Maps/Shipping/Map11/MapSkins/Default"));
    let odyssey = HexBinHash::from(h("Maps/Shipping/Map11/MapSkins/Odyssey"));
    assert_eq!(
        text,
        format!(
            "version: 1\nmodules:\n  - name: Link map skins to {CLASSIC}\n    target: \"data/maps/shipping/map11/map11.bin\"\n    \"{default}\":\n      mMapContainerLink: \"{CLASSIC}\"\n    \"{odyssey}\":\n      mMapContainerLink: \"{CLASSIC}\"\n"
        )
    );
}

/// The map at `LTK_LIVE_MAPGEO`, `<wad path>#<chunk hash in hex>`.
fn live() -> Vec<u8> {
    let Ok(target) = std::env::var("LTK_LIVE_MAPGEO") else {
        panic!("set LTK_LIVE_MAPGEO to '<wad path>#<chunk hash in hex>'");
    };
    let (path, hash) = target
        .rsplit_once('#')
        .expect("a target names a chunk with #");
    let hash = u64::from_str_radix(hash, 16).expect("a chunk hash is hex");

    let mut wad = ltk_wad::Wad::mount(fs_err::File::open(path).unwrap()).unwrap();
    let chunk = *wad.chunks().get(ltk_hash::WadHash(hash)).unwrap();
    wad.load_chunk_decompressed(&chunk).unwrap().into()
}

/// Run by name against an install:
///
/// ```text
/// LTK_LIVE_MAPGEO='<wad path>#<chunk hash in hex>' \
///   cargo test -p ltk-manager-game state_meshes -- --ignored --nocapture
/// ```
#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_MAPGEO"]
fn state_meshes_keeps_meshes_with_controller_or_region() {
    let bytes = live();

    let kept = MapGeometryDocument::parse(&state_meshes(&bytes).unwrap())
        .unwrap()
        .meshes();
    let expected = MapGeometryDocument::parse(&bytes)
        .unwrap()
        .meshes()
        .into_iter()
        .filter(|mesh| mesh.controller.is_some() || mesh.region.is_some())
        .count();

    assert_eq!(kept.len(), expected);
    assert!(
        kept.iter()
            .all(|mesh| mesh.controller.is_some() || mesh.region.is_some())
    );
}
