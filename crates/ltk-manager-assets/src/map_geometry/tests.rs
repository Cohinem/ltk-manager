//! An open `.mapgeo` edited, undone, redone and written. The edits run against a shipped map,
//! because `ltk_mapgeo` builds an asset only by reading one.

use super::*;

#[test]
fn hash_text_writes_none_for_zero() {
    assert_eq!(hash_text(0), None);
    assert_eq!(hash_text(0xe07e_dfa4).as_deref(), Some("0xe07edfa4"));
}

#[test]
fn parse_hash_reads_prefixed_hex() {
    assert_eq!(parse_hash("0xe07edfa4"), Some(0xe07e_dfa4));
    assert_eq!(parse_hash("e07edfa4"), None);
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
///   cargo test -p ltk-manager-assets map_geometry -- --ignored --nocapture
/// ```
#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_MAPGEO"]
fn edit_undo_redo_and_save_round_trip_a_shipped_map() {
    let bytes = live();
    let mut document = MapGeometryDocument::parse(&bytes).unwrap();
    let original = document.meshes();
    let mesh = original
        .iter()
        .position(|mesh| mesh.region.is_none())
        .unwrap() as u32;

    let mut moved = original[mesh as usize].transform;
    moved[12] += 100.0;
    let deltas = document
        .edit(MapGeometryEdit::Transform {
            meshes: vec![MeshTransform {
                mesh,
                transform: moved,
            }],
        })
        .unwrap();
    assert!(matches!(
        &deltas[..],
        [MeshDelta::Update { mesh: at, from, record }]
            if *at == mesh && *from == original[mesh as usize].transform && record.transform == moved
    ));
    assert!(document.is_dirty());

    let renamed = document
        .edit(MapGeometryEdit::Material {
            mesh,
            submesh: 0,
            material: "Maps/Test/Material".to_owned(),
        })
        .unwrap();
    assert!(matches!(
        &renamed[..],
        [MeshDelta::Update { record, .. }] if record.materials[0] == "Maps/Test/Material"
    ));

    let count = original.len() as u32;
    let inserted = document
        .edit(MapGeometryEdit::Duplicate { meshes: vec![mesh] })
        .unwrap();
    assert_eq!(inserted, [MeshDelta::Insert { mesh: count }]);
    assert!(
        !document
            .preview_meshes(&[count as usize])
            .unwrap()
            .is_empty()
    );

    let removed = document
        .edit(MapGeometryEdit::Remove { meshes: vec![mesh] })
        .unwrap();
    assert_eq!(removed, [MeshDelta::Remove { mesh }]);
    assert_eq!(document.meshes().len(), original.len());

    assert_eq!(
        document.undo().unwrap(),
        Some(vec![MeshDelta::Insert { mesh }])
    );
    assert_eq!(
        document.undo().unwrap(),
        Some(vec![MeshDelta::Remove { mesh: count }])
    );
    document.undo().unwrap();
    document.undo().unwrap();
    assert_eq!(document.meshes(), original);
    assert_eq!(document.undo().unwrap(), None);

    document.redo().unwrap();
    assert_eq!(document.meshes()[mesh as usize].transform, moved);

    let written = document.to_bytes().unwrap();
    document.saved_as(&written);
    assert!(!document.is_dirty());
    assert!(document.is_base(&written));

    let reread = MapGeometryDocument::parse(&written).unwrap();
    assert_eq!(reread.meshes(), document.meshes());
    document.preview().unwrap();
}

/// A version 18 map that holds no mesh, buffer or scene graph.
fn empty_map() -> Vec<u8> {
    let mut bytes = ltk_mapgeo::MAGIC.to_vec();
    for value in [18u32, 0, 0, 0, 0, 0, 0, 0] {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

/// An OBJ quad of one material in a temporary folder, and the path of the `.obj`.
fn quad_obj() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("quad.obj");
    fs_err::write(
        &path,
        "v 0 0 0\nv 1 0 0\nv 1 0 1\nv 0 0 1\nusemtl Stone\nf 1 2 3 4\n",
    )
    .unwrap();
    (dir, path.display().to_string())
}

fn import(source: String, transform: Mat4) -> MapGeometryEdit {
    MapGeometryEdit::Import {
        source,
        meshes: vec![0],
        scale: 100.0,
        up: UpAxis::Y,
        materials: vec!["Maps/Test/Materials/Stone".to_owned()],
        visibility: 0b11,
        controller: Some("0x00000010".to_owned()),
        transform: transform.to_cols_array(),
    }
}

#[test]
fn import_inserts_meshes_as_one_undo_step() {
    let (_dir, source) = quad_obj();
    let mut document = MapGeometryDocument::parse(&empty_map()).unwrap();
    let placed = Mat4::from_translation(glam::Vec3::new(5.0, 0.0, 7.0));

    let deltas = document.edit(import(source, placed)).unwrap();

    assert_eq!(deltas, [MeshDelta::Insert { mesh: 0 }]);
    let meshes = document.meshes();
    assert_eq!(meshes.len(), 1);
    assert_eq!(meshes[0].materials, ["Maps/Test/Materials/Stone"]);
    assert_eq!(meshes[0].transform, placed.to_cols_array());
    assert_eq!(meshes[0].visibility, 0b11);
    assert_eq!(meshes[0].controller.as_deref(), Some("0x00000010"));
    assert_eq!(meshes[0].vertex_count, 4);
    assert_eq!(meshes[0].min, [-95.0, 0.0, 7.0]);

    assert_eq!(
        document.undo().unwrap(),
        Some(vec![MeshDelta::Remove { mesh: 0 }])
    );
    assert!(document.meshes().is_empty());
    assert_eq!(
        document.redo().unwrap(),
        Some(vec![MeshDelta::Insert { mesh: 0 }])
    );
    assert_eq!(document.meshes(), meshes);

    let written = document.to_bytes().unwrap();
    let reread = MapGeometryDocument::parse(&written).unwrap();
    assert_eq!(reread.meshes(), meshes);
}

#[test]
fn import_refuses_missing_material() {
    let (_dir, source) = quad_obj();
    let mut document = MapGeometryDocument::parse(&empty_map()).unwrap();
    let mut edit = import(source, Mat4::IDENTITY);
    if let MapGeometryEdit::Import { materials, .. } = &mut edit {
        materials.clear();
    }

    assert!(matches!(
        document.edit(edit),
        Err(MapGeometryError::NoSourceMaterial(0))
    ));
    assert!(!document.is_dirty());
}

/// Run by name against an install, as the test above it.
#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_MAPGEO"]
fn import_into_shipped_map_saves_and_reads_back() {
    let (_dir, source) = quad_obj();
    let mut document = MapGeometryDocument::parse(&live()).unwrap();
    let count = document.meshes().len() as u32;

    let deltas = document.edit(import(source, Mat4::IDENTITY)).unwrap();
    assert_eq!(deltas, [MeshDelta::Insert { mesh: count }]);
    assert!(
        !document
            .preview_meshes(&[count as usize])
            .unwrap()
            .is_empty()
    );

    let written = document.to_bytes().unwrap();
    let reread = MapGeometryDocument::parse(&written).unwrap();
    assert_eq!(reread.meshes(), document.meshes());
    assert_eq!(
        reread.meshes()[count as usize].materials,
        ["Maps/Test/Materials/Stone"]
    );
}
