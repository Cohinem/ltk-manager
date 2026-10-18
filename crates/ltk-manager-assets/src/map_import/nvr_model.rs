//! Reads an `.nvr` file of the first League clients, versions 8.1 and 9.1.

use std::io::Cursor;
use std::path::Path;

use glam::{Vec2, Vec3};
use ltk_mapgeo::nvr::{MaterialFlags, MaterialType, SimpleEnvironment};
use ltk_mesh::mem::vertex::{ElementName, VertexBuffer};

use fs_err as fs;

use super::{
    ImportError, ModelFile, SourceMaterial, SourceMesh, SourcePart, TextureSource, UpAxis,
};

/// The importer's source space mirrors x against the engine space that an `.nvr` stores.
fn mirrored(v: Vec3) -> Vec3 {
    Vec3::new(-v.x, v.y, v.z)
}

/// Reads the `.nvr` at `path` as one mesh per material, which holds every `.nvr` mesh drawn
/// with that material.
pub(super) fn read(path: &Path) -> Result<ModelFile, ImportError> {
    let bytes = fs::read(path)?;
    let nvr = SimpleEnvironment::from_reader(&mut Cursor::new(bytes))?;
    let base = path.parent().unwrap_or(Path::new(""));

    let materials = nvr
        .materials()
        .iter()
        .map(|material| SourceMaterial {
            name: material.name().to_owned(),
            texture: (!material.diffuse_texture().is_empty())
                .then(|| TextureSource::File(base.join(material.diffuse_texture()))),
            alpha: material.kind() == MaterialType::Decal
                || material.flags().contains(MaterialFlags::VERTEX_ALPHA),
        })
        .collect::<Vec<_>>();

    let mut meshes: Vec<SourceMesh> = materials
        .iter()
        .enumerate()
        .map(|(material, source)| SourceMesh {
            name: source.name.clone(),
            normals: Some(Vec::new()),
            uv0: Some(Vec::new()),
            colors: Some(Vec::new()),
            parts: vec![SourcePart {
                material,
                indices: Vec::new(),
            }],
            ..SourceMesh::default()
        })
        .collect();

    for mesh in nvr.meshes() {
        let material = nvr.material_of(mesh);
        let vertices = VertexBuffer::new(
            material.vertex_description(),
            nvr.detailed_vertices(mesh).to_vec(),
        );
        let (Some(positions), Some(normals), Some(uvs), Some(colors)) = (
            vertices.accessor::<Vec3>(ElementName::Position),
            vertices.accessor::<Vec3>(ElementName::Normal),
            vertices.accessor::<Vec2>(ElementName::Texcoord0),
            vertices.accessor::<[u8; 4]>(ElementName::PrimaryColor),
        ) else {
            continue;
        };

        let out = &mut meshes[mesh.material()];
        let start = out.positions.len() as u32;
        let first = mesh.detailed().start_vertex() as u32;
        out.positions.extend(positions.iter().map(mirrored));
        if let Some(held) = &mut out.normals {
            held.extend(normals.iter().map(mirrored));
        }
        if let Some(held) = &mut out.uv0 {
            held.extend(uvs.iter());
        }
        if let Some(held) = &mut out.colors {
            held.extend(colors.iter().map(|[b, g, r, a]| [r, g, b, a]));
        }
        out.parts[0].indices.extend(
            nvr.detailed_indices(mesh)
                .iter()
                .map(|&index| index.saturating_sub(first) + start),
        );
    }
    meshes.retain(|mesh| !mesh.parts[0].indices.is_empty());

    Ok(ModelFile {
        meshes,
        materials,
        scale: 1.0,
        up: UpAxis::Y,
        skipped: Vec::new(),
    })
}
