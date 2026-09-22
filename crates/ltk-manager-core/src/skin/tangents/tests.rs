use super::*;
use glam::{Vec3, Vec4};
use ltk_mesh::mem::{IndexBuffer, VertexBuffer, VertexBufferDescription, vertex::ElementName};
use ltk_mesh::{SkinnedMeshRange, SkinnedMeshVertexType};

fn mesh_bytes(normal_z: f32) -> Vec<u8> {
    let mut vertices = Vec::new();
    for (position, uv) in [
        ([0.0_f32, 0.0, 0.0], [0.0_f32, 0.0]),
        ([1.0, 0.0, 0.0], [1.0, 0.0]),
        ([0.0, 1.0, 0.0], [0.0, 1.0]),
    ] {
        for value in position {
            vertices.extend_from_slice(&value.to_le_bytes());
        }

        vertices.extend_from_slice(&[0; 4]);
        for value in [1.0_f32, 0.0, 0.0, 0.0, 0.0, 0.0, normal_z]
            .into_iter()
            .chain(uv)
        {
            vertices.extend_from_slice(&value.to_le_bytes());
        }
    }

    let mesh = SkinnedMesh::new(
        vec![SkinnedMeshRange::new("body", 0, 3, 0, 3)],
        VertexBuffer::new(
            VertexBufferDescription::from(SkinnedMeshVertexType::Basic),
            vertices,
        ),
        IndexBuffer::new(
            [0_u16, 1, 2]
                .into_iter()
                .flat_map(u16::to_le_bytes)
                .collect(),
        ),
    );
    let mut bytes = Vec::new();
    mesh.to_writer(&mut bytes).unwrap();
    bytes
}

fn layer(project: &std::path::Path, name: &str, path: &str) -> AssetRef {
    AssetRef::Layer {
        project: project.to_string_lossy().into_owned(),
        layer: name.to_owned(),
        path: path.to_owned(),
    }
}

#[test]
fn baking_persists_tangents_and_preserves_mesh_geometry() {
    let project = tempfile::tempdir().unwrap();
    let root = project.path().join("content/base");
    fs::create_dir_all(&root).unwrap();
    let path = root.join("body.skn");
    let original = mesh_bytes(1.0);
    fs::write(&path, &original).unwrap();
    let skin = layer(project.path(), "base", "skin.bin");
    let asset = layer(project.path(), "base", "body.skn");

    bake_mesh_tangents(&skin, &asset).unwrap();

    let saved = fs::read(&path).unwrap();
    let mesh = SkinnedMesh::from_reader(&mut Cursor::new(&saved)).unwrap();
    assert_eq!(mesh.vertex_type(), Some(SkinnedMeshVertexType::Tangent));
    assert_eq!(mesh.vertex_buffer().count(), 3);
    assert_eq!(mesh.index_buffer().count(), 3);
    let before = SkinnedMesh::from_reader(&mut Cursor::new(&original)).unwrap();
    let positions = |mesh: &SkinnedMesh| {
        mesh.vertex_buffer()
            .accessor::<Vec3>(ElementName::Position)
            .unwrap()
            .iter()
            .collect::<Vec<_>>()
    };
    assert_eq!(positions(&mesh), positions(&before));
    let tangents = mesh
        .vertex_buffer()
        .accessor::<Vec4>(ElementName::Texcoord6)
        .unwrap();
    assert!(
        tangents
            .iter()
            .all(|tangent| tangent.is_finite() && tangent.w.abs() == 1.0)
    );

    bake_mesh_tangents(&skin, &asset).unwrap();
    assert_eq!(fs::read(&path).unwrap(), saved);
}

#[test]
fn failed_baking_leaves_the_original_file_untouched() {
    let project = tempfile::tempdir().unwrap();
    let root = project.path().join("content/base");
    fs::create_dir_all(&root).unwrap();
    let path = root.join("body.skn");
    for original in [b"invalid mesh".to_vec(), mesh_bytes(0.0)] {
        fs::write(&path, &original).unwrap();

        let result = bake_mesh_tangents(
            &layer(project.path(), "base", "skin.bin"),
            &layer(project.path(), "base", "body.skn"),
        );

        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    }
}

#[test]
fn baking_rejects_other_layers_loose_files_and_game_chunks() {
    let project = tempfile::tempdir().unwrap();
    let skin = layer(project.path(), "base", "skin.bin");
    for asset in [
        layer(project.path(), "chroma", "body.skn"),
        layer(&project.path().join("other"), "base", "body.skn"),
        AssetRef::File {
            path: "body.skn".to_owned(),
        },
        AssetRef::GameChunk {
            wad: "Ahri.wad.client".to_owned(),
            path_hash: "0000000000000000".to_owned(),
            project: None,
        },
    ] {
        assert!(bake_mesh_tangents(&skin, &asset).is_err());
        assert!(bake_mesh_tangents(&asset, &skin).is_err());
    }
}

#[test]
fn baking_rejects_paths_outside_the_project() {
    let project = tempfile::tempdir().unwrap();
    let skin = layer(project.path(), "base", "skin.bin");
    let asset = layer(project.path(), "base", "../../body.skn");

    assert!(matches!(
        bake_mesh_tangents(&skin, &asset),
        Err(AppError::InvalidPath(_))
    ));
}
