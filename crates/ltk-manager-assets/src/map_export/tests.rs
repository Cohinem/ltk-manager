use glam::{Mat4, Vec2, Vec3};

use super::*;
use crate::map_import::{UpAxis, lower, read_model};

fn quad(index: u32, transform: Mat4) -> ExportMesh {
    ExportMesh {
        index,
        name: format!("MapGeo_Instance_{index}"),
        transform,
        positions: vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(10.0, 0.0, 0.0),
            Vec3::new(10.0, 0.0, 10.0),
            Vec3::new(0.0, 0.0, 10.0),
        ],
        normals: Some(vec![Vec3::Y; 4]),
        uv0: Some(vec![Vec2::ZERO, Vec2::X, Vec2::ONE, Vec2::Y]),
        uv1: None,
        colors: Some(vec![[255, 0, 0, 255]; 4]),
        parts: vec![
            ExportPart {
                material: "Maps/Materials/Ground".to_owned(),
                indices: vec![0, 1, 2],
            },
            ExportPart {
                material: "Maps/Materials/Rock".to_owned(),
                indices: vec![0, 2, 3],
            },
        ],
    }
}

fn written(meshes: &[ExportMesh]) -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    let bytes = write_glb(meshes, "Maps/MapGeometry/Map11/Base_SRX", &HashMap::new()).unwrap();
    fs_err::write(directory.path().join("export.glb"), bytes).unwrap();
    directory
}

#[test]
fn write_glb_reads_back_through_the_importer_in_world_space() {
    let moved = Mat4::from_translation(Vec3::new(100.0, 5.0, -20.0));
    let directory = written(&[quad(7, moved)]);

    let model = read_model(&directory.path().join("export.glb")).unwrap();

    assert_eq!(model.meshes.len(), 1);
    assert_eq!(model.materials.len(), 2);
    let lowered = lower(&model.meshes[0], model.scale, model.up);
    let positions = lowered[0]
        .vertices
        .accessor::<Vec3>(ElementName::Position)
        .unwrap();
    let mut read: Vec<Vec3> = (0..lowered[0].vertices.count())
        .map(|at| positions.get(at))
        .collect();
    /* The importer reads the shared attributes once per primitive, so a vertex that two
    submeshes share appears twice. */
    read.sort_by(|a, b| a.to_array().partial_cmp(&b.to_array()).unwrap());
    read.dedup();
    let mut expected: Vec<Vec3> = quad(7, moved)
        .positions
        .iter()
        .map(|&p| moved.transform_point3(p))
        .collect();
    expected.sort_by(|a, b| a.to_array().partial_cmp(&b.to_array()).unwrap());
    assert_eq!(read, expected);
    assert_eq!(model.up, UpAxis::Y);
}

#[test]
fn write_glb_records_each_mesh_in_its_extras() {
    let directory = written(&[quad(3, Mat4::IDENTITY), quad(9, Mat4::IDENTITY)]);

    let summary = read_model(&directory.path().join("export.glb"))
        .unwrap()
        .summary();

    let exported: Vec<_> = summary
        .meshes
        .iter()
        .map(|mesh| mesh.exported.clone())
        .collect();
    assert_eq!(
        exported,
        vec![
            Some(ExportedMesh {
                mesh: 3,
                container: "Maps/MapGeometry/Map11/Base_SRX".to_owned(),
                vertices: 4,
            }),
            Some(ExportedMesh {
                mesh: 9,
                container: "Maps/MapGeometry/Map11/Base_SRX".to_owned(),
                vertices: 4,
            }),
        ]
    );
    assert_eq!(summary.meshes[0].name, "MapGeo_Instance_3");
}
