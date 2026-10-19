//! Model files written into a temporary folder, read and lowered into map meshes.

use super::*;

use ltk_mesh::mem::vertex::ElementName;

const QUAD_OBJ: &str = "mtllib quad.mtl
v 0 0 0
v 1 0 0
v 1 0 1
v 0 0 1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
usemtl Stone
f 1/1 2/2 3/3 4/4
";

const QUAD_MTL: &str = "newmtl Stone
map_Kd stone.png
";

/// Writes `files` into a new temporary folder.
fn folder(files: &[(&str, &[u8])]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (name, bytes) in files {
        fs::write(dir.path().join(name), bytes).unwrap();
    }
    dir
}

fn quad_obj() -> tempfile::TempDir {
    folder(&[
        ("quad.obj", QUAD_OBJ.as_bytes()),
        ("quad.mtl", QUAD_MTL.as_bytes()),
    ])
}

/// A glTF file whose one node, moved by 10 on x, draws one triangle.
fn triangle_gltf() -> tempfile::TempDir {
    let positions: [[f32; 3]; 3] = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]];
    let bin: Vec<u8> = positions
        .iter()
        .flatten()
        .flat_map(|value| value.to_le_bytes())
        .collect();
    let json = format!(
        r#"{{
  "asset": {{ "version": "2.0" }},
  "scene": 0,
  "scenes": [{{ "nodes": [0] }}],
  "nodes": [{{ "name": "Rock", "mesh": 0, "translation": [10, 0, 0] }}],
  "meshes": [{{ "primitives": [{{ "attributes": {{ "POSITION": 0 }}, "material": 0 }}] }}],
  "materials": [{{ "name": "Leaf", "alphaMode": "MASK" }}],
  "accessors": [{{
    "bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3",
    "min": [0, 0, 0], "max": [1, 1, 0]
  }}],
  "bufferViews": [{{ "buffer": 0, "byteLength": {length} }}],
  "buffers": [{{ "uri": "triangle.bin", "byteLength": {length} }}]
}}"#,
        length = bin.len()
    );
    folder(&[("triangle.gltf", json.as_bytes()), ("triangle.bin", &bin)])
}

#[test]
fn read_model_reads_obj_with_its_mtl() {
    let dir = quad_obj();
    let model = read_model(&dir.path().join("quad.obj")).unwrap();

    assert_eq!(model.meshes.len(), 1);
    let mesh = &model.meshes[0];
    assert_eq!(mesh.triangle_count(), 2);
    assert_eq!(mesh.positions.len(), 4);
    assert!(mesh.normals.is_none());
    assert_eq!(model.scale, 1.0);
    assert_eq!(model.up, UpAxis::Y);

    assert_eq!(model.materials.len(), 1);
    assert_eq!(model.materials[0].name, "Stone");
    let summary = model.summary();
    assert!(summary.materials[0].missing);
    assert!(
        summary.materials[0]
            .texture
            .as_deref()
            .unwrap()
            .ends_with("stone.png")
    );

    /* The UV origin moves from the bottom to the top. */
    let uv = mesh.uv0.as_ref().unwrap();
    let corner = mesh
        .positions
        .iter()
        .position(|p| *p == Vec3::ZERO)
        .unwrap();
    assert_eq!(uv[corner], Vec2::new(0.0, 1.0));
}

#[test]
fn read_model_applies_gltf_node_transforms() {
    let dir = triangle_gltf();
    let model = read_model(&dir.path().join("triangle.gltf")).unwrap();

    assert_eq!(model.meshes.len(), 1);
    assert_eq!(model.meshes[0].name, "Rock");
    assert_eq!(model.meshes[0].positions[0], Vec3::new(10.0, 0.0, 0.0));
    assert_eq!(
        model.meshes[0].parts,
        [SourcePart {
            material: 0,
            indices: vec![0, 1, 2]
        }]
    );
    assert!(model.materials[0].alpha);
    assert!(model.skipped.is_empty());
}

#[test]
fn read_model_refuses_unknown_extension() {
    assert!(matches!(
        read_model(Path::new("model.blend")),
        Err(ImportError::Unsupported(extension)) if extension == "blend"
    ));
}

fn positions(mesh: &LoweredMesh) -> Vec<Vec3> {
    mesh.vertices
        .accessor::<Vec3>(ElementName::Position)
        .unwrap()
        .iter()
        .collect()
}

fn triangle(material: usize) -> SourceMesh {
    SourceMesh {
        positions: vec![Vec3::ZERO, Vec3::X, Vec3::Y],
        parts: vec![SourcePart {
            material,
            indices: vec![0, 1, 2],
        }],
        ..SourceMesh::default()
    }
}

#[test]
fn lower_mirrors_x_and_scales() {
    let lowered = lower(&triangle(0), 100.0, UpAxis::Y);

    assert_eq!(lowered.len(), 1);
    assert_eq!(
        positions(&lowered[0]),
        [
            Vec3::ZERO,
            Vec3::new(-100.0, 0.0, 0.0),
            Vec3::new(0.0, 100.0, 0.0)
        ]
    );
    assert_eq!(
        lowered[0].submeshes,
        [LoweredSubmesh {
            material: 0,
            start_index: 0,
            index_count: 3,
            min_vertex: 0,
            max_vertex: 2
        }]
    );
}

#[test]
fn lower_turns_z_up_to_y_up() {
    let mut mesh = triangle(0);
    mesh.positions[2] = Vec3::Z;

    let lowered = lower(&mesh, 1.0, UpAxis::Z);

    assert_eq!(positions(&lowered[0])[2], Vec3::Y);
}

#[test]
fn lower_computes_missing_normals() {
    let lowered = lower(&triangle(0), 1.0, UpAxis::Y);

    let normals: Vec<Vec3> = lowered[0]
        .vertices
        .accessor::<Vec3>(ElementName::Normal)
        .unwrap()
        .iter()
        .collect();
    assert_eq!(normals, [Vec3::Z; 3]);
}

#[test]
fn lower_splits_at_vertex_limit() {
    let triangles = MAX_MESH_VERTICES / 3 + 1;
    let mesh = SourceMesh {
        positions: (0..triangles * 3)
            .map(|at| Vec3::splat(at as f32))
            .collect(),
        parts: vec![SourcePart {
            material: 0,
            indices: (0..(triangles * 3) as u32).collect(),
        }],
        ..SourceMesh::default()
    };

    let lowered = lower(&mesh, 1.0, UpAxis::Y);

    assert_eq!(lowered.len(), 2);
    assert_eq!(lowered[0].vertices.count(), MAX_MESH_VERTICES);
    assert_eq!(lowered[1].vertices.count(), 3);
}

#[test]
fn lower_splits_at_submesh_limit() {
    let mut mesh = triangle(0);
    mesh.parts = (0..=EnvironmentMesh::MAX_SUBMESH_COUNT)
        .map(|material| SourcePart {
            material,
            indices: vec![0, 1, 2],
        })
        .collect();

    let lowered = lower(&mesh, 1.0, UpAxis::Y);

    assert_eq!(lowered.len(), 2);
    assert_eq!(
        lowered[0].submeshes.len(),
        EnvironmentMesh::MAX_SUBMESH_COUNT
    );
    assert_eq!(
        lowered[1].submeshes[0].material,
        EnvironmentMesh::MAX_SUBMESH_COUNT
    );
}

#[test]
fn lower_skips_triangles_past_the_vertices() {
    let mut mesh = triangle(0);
    mesh.parts[0].indices.extend([0, 1, 9]);

    let lowered = lower(&mesh, 1.0, UpAxis::Y);

    assert_eq!(lowered[0].indices.count(), 3);
}

fn summary_mesh(name: &str, exported: Option<(u32, u32)>) -> ModelMeshSummary {
    ModelMeshSummary {
        name: name.to_owned(),
        vertices: 3,
        triangles: 1,
        materials: vec![0],
        exported: exported.map(|(mesh, vertices)| ExportedMesh {
            mesh,
            container: "Maps/MapGeometry/Map11/Base_SRX".to_owned(),
            vertices,
        }),
    }
}

const TARGET: ReimportTarget<'static> = ReimportTarget {
    index: 12,
    name: "MapGeo_Instance_12",
    container: "Maps/MapGeometry/Map11/Base_SRX",
    vertices: 300,
};

#[test]
fn reimport_source_takes_the_only_mesh_of_a_file() {
    assert_eq!(
        reimport_source(&[summary_mesh("Rock", None)], TARGET),
        Some(0)
    );
}

#[test]
fn reimport_source_matches_export_extras_before_the_name() {
    let meshes = [
        summary_mesh("MapGeo_Instance_12", None),
        summary_mesh("Edited", Some((12, 300))),
    ];

    assert_eq!(reimport_source(&meshes, TARGET), Some(1));
}

#[test]
fn reimport_source_returns_none_for_stale_extras() {
    let meshes = [
        summary_mesh("MapGeo_Instance_12", Some((12, 120))),
        summary_mesh("Other", Some((13, 300))),
    ];

    assert_eq!(reimport_source(&meshes, TARGET), None);
}

#[test]
fn reimport_source_falls_back_to_the_mesh_name() {
    let named = [
        summary_mesh("Rock", None),
        summary_mesh("MapGeo_Instance_12", None),
    ];
    let unnamed = [summary_mesh("A", None), summary_mesh("B", None)];

    assert_eq!(reimport_source(&named, TARGET), Some(1));
    assert_eq!(reimport_source(&unnamed, TARGET), None);
}

#[test]
fn preview_buffer_writes_lowered_positions_and_indices() {
    let model = ModelFile {
        meshes: vec![triangle(0), triangle(0)],
        materials: Vec::new(),
        scale: 2.0,
        up: UpAxis::Y,
        skipped: Vec::new(),
    };

    let bytes = preview_buffer(&model, &[1, 5], 2.0, UpAxis::Y);

    let words: Vec<u32> = bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|word| u32::from_le_bytes(*word))
        .collect();
    assert_eq!(&words[..2], &[3, 3]);
    assert_eq!(f32::from_bits(words[5]), -2.0);
    assert_eq!(&words[11..], &[0, 1, 2]);
}
