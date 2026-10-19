//! Writes meshes of a `.mapgeo` to a binary glTF file, for the map editor's export. "Adding
//! meshes" in docs/ux/MAP_EDITOR.md.

use std::collections::HashMap;

use glam::{Mat4, Vec2, Vec3};
use indexmap::IndexSet;
use ltk_manager_base::error::{AppError, DomainError, ErrorKind};
use ltk_mapgeo::{EnvironmentAsset, EnvironmentMesh};
use ltk_mesh::mem::VertexBuffer;
use ltk_mesh::mem::vertex::{ElementName, Format};
use serde_json::{Value, json};
use thiserror::Error;

use crate::map_import::{EXPORTED_KEY, ExportedMesh};

/// The `magic` of a binary glTF file, `glTF`.
const GLB_MAGIC: u32 = 0x4654_6C67;
const GLB_VERSION: u32 = 2;
/// The chunk types of a binary glTF file, `JSON` and `BIN`.
const JSON_CHUNK: u32 = 0x4E4F_534A;
const BIN_CHUNK: u32 = 0x004E_4942;

/// glTF component types and buffer view targets.
const FLOAT: u32 = 5126;
const UNSIGNED_BYTE: u32 = 5121;
const UNSIGNED_SHORT: u32 = 5123;
const ARRAY_BUFFER: u32 = 34962;
const ELEMENT_ARRAY_BUFFER: u32 = 34963;
const REPEAT: u32 = 10497;

/// The engine mirrors x against glTF's right-handed Y-up space.
const MIRROR: Vec3 = Vec3::new(-1.0, 1.0, 1.0);

/// Why a map could not be exported.
#[derive(Debug, Error)]
pub enum ExportError {
    /// An export requests a mesh index past the map's meshes.
    #[error("The map has no mesh {0}")]
    NoMesh(usize),

    /// A mesh carries no positions that this build reads, or its buffers do not match it.
    #[error("Mesh {0} has a vertex layout that cannot be exported")]
    Layout(usize),

    /// The glTF document could not be encoded.
    #[error("The glTF file could not be encoded: {0}")]
    Json(#[from] serde_json::Error),
}

impl From<ExportError> for AppError {
    fn from(error: ExportError) -> Self {
        Self::Domain(DomainError::new(ErrorKind::Preview, error))
    }
}

/// An image file that a material's base color texture is written as.
#[derive(Debug, Clone)]
pub struct ExportTexture {
    /// The encoded image.
    pub bytes: Vec<u8>,
    /// `image/png` or `image/jpeg`.
    pub mime: String,
}

/// The triangles of one submesh, with the material that they draw with.
#[derive(Debug, Clone, PartialEq)]
pub struct ExportPart {
    /// The entry path of the `StaticMaterialDef`.
    pub material: String,
    /// The triangle indices into the mesh's vertices, three per triangle.
    pub indices: Vec<u16>,
}

/// One map mesh as the glTF writer takes it, in the engine's axes and in the mesh's own space.
#[derive(Debug, Clone, PartialEq)]
pub struct ExportMesh {
    /// The index of the mesh in the `.mapgeo`.
    pub index: u32,
    /// The name that the glTF mesh and node take.
    pub name: String,
    /// The mesh transform.
    pub transform: Mat4,
    /// The vertex positions.
    pub positions: Vec<Vec3>,
    /// The vertex normals, and `None` if the mesh has none.
    pub normals: Option<Vec<Vec3>>,
    /// The first UV set, `Texcoord0`, and `None` if the mesh has none.
    pub uv0: Option<Vec<Vec2>>,
    /// The lightmap UV, `Texcoord7`.
    pub uv1: Option<Vec<Vec2>>,
    /// RGBA.
    pub colors: Option<Vec<[u8; 4]>>,
    pub parts: Vec<ExportPart>,
}

/// Reads the meshes at `meshes` of `asset`, in that order.
///
/// # Errors
///
/// Fails if an index is past the meshes, or a mesh has no readable positions or a submesh
/// past its index buffer.
pub fn export_meshes(
    asset: &EnvironmentAsset,
    meshes: &[usize],
) -> Result<Vec<ExportMesh>, ExportError> {
    meshes
        .iter()
        .map(|&at| {
            let mesh = asset.meshes().get(at).ok_or(ExportError::NoMesh(at))?;
            export_mesh(asset, mesh, at)
        })
        .collect()
}

/// Reads the first `count` values of `element` from `buffer`. Returns `None` if `buffer` is
/// `None` or does not hold `element` in the format `T`.
fn values<T: Format>(
    buffer: Option<&VertexBuffer>,
    element: ElementName,
    count: usize,
) -> Option<Vec<T::Item>> {
    let accessor = buffer?.accessor::<T>(element)?;
    Some((0..count).map(|vertex| accessor.get(vertex)).collect())
}

fn export_mesh(
    asset: &EnvironmentAsset,
    mesh: &EnvironmentMesh,
    at: usize,
) -> Result<ExportMesh, ExportError> {
    let count = mesh.vertex_count() as usize;
    let read = |element: ElementName| -> Option<&VertexBuffer> {
        mesh.vertex_buffer_ids()
            .iter()
            .filter_map(|&id| asset.vertex_buffer(id))
            .find(|buffer| buffer.elements().contains_key(&element))
    };
    let vec3 = |element| values::<Vec3>(read(element), element, count);
    let vec2 = |element| values::<Vec2>(read(element), element, count);

    let positions = vec3(ElementName::Position).ok_or(ExportError::Layout(at))?;
    /* `PrimaryColor` is packed blue first. */
    let colors = read(ElementName::PrimaryColor)
        .and_then(|buffer| buffer.accessor::<[u8; 4]>(ElementName::PrimaryColor))
        .map(|accessor| {
            (0..count)
                .map(|vertex| {
                    let [b, g, r, a] = accessor.get(vertex);
                    [r, g, b, a]
                })
                .collect()
        });

    let indices = asset
        .index_buffer(mesh.index_buffer_id())
        .ok_or(ExportError::Layout(at))?;
    let parts = mesh
        .submeshes()
        .iter()
        .map(|submesh| {
            let start =
                usize::try_from(submesh.start_index()).map_err(|_| ExportError::Layout(at))?;
            let length =
                usize::try_from(submesh.index_count()).map_err(|_| ExportError::Layout(at))?;
            if start + length > indices.count() {
                return Err(ExportError::Layout(at));
            }
            Ok(ExportPart {
                material: submesh.material().to_owned(),
                indices: (start..start + length)
                    .map(|index| indices.get(index))
                    .collect(),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(ExportMesh {
        index: at as u32,
        name: mesh.name().to_owned(),
        transform: *mesh.transform(),
        positions,
        normals: vec3(ElementName::Normal),
        uv0: vec2(ElementName::Texcoord0),
        uv1: vec2(ElementName::Texcoord7),
        colors,
        parts,
    })
}

/// The binary chunk, buffer views and accessors that [`write_glb`] builds.
#[derive(Default)]
struct Glb {
    bin: Vec<u8>,
    views: Vec<Value>,
    accessors: Vec<Value>,
}

impl Glb {
    /// Appends `bytes` on a four-byte boundary and returns the index of its buffer view.
    fn view(&mut self, bytes: &[u8], target: Option<u32>) -> usize {
        self.bin.resize(self.bin.len().next_multiple_of(4), 0);
        let mut view =
            json!({ "buffer": 0, "byteOffset": self.bin.len(), "byteLength": bytes.len() });
        if let Some(target) = target {
            view["target"] = json!(target);
        }
        self.bin.extend_from_slice(bytes);
        self.views.push(view);
        self.views.len() - 1
    }

    /// Appends `values` as a vertex attribute of `kind` and returns the index of its accessor.
    fn floats(&mut self, values: &[f32], width: usize, kind: &str, bounds: bool) -> usize {
        let bytes: Vec<u8> = values
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let view = self.view(&bytes, Some(ARRAY_BUFFER));
        let mut accessor = json!({
            "bufferView": view,
            "componentType": FLOAT,
            "count": values.len() / width,
            "type": kind,
        });
        if bounds {
            let (min, max) = (0..width)
                .map(|axis| {
                    values
                        .iter()
                        .skip(axis)
                        .step_by(width)
                        .fold((f32::INFINITY, f32::NEG_INFINITY), |(low, high), &value| {
                            (low.min(value), high.max(value))
                        })
                })
                .unzip::<_, _, Vec<f32>, Vec<f32>>();
            accessor["min"] = json!(min);
            accessor["max"] = json!(max);
        }
        self.accessors.push(accessor);
        self.accessors.len() - 1
    }

    fn accessor(&mut self, accessor: Value) -> usize {
        self.accessors.push(accessor);
        self.accessors.len() - 1
    }
}

/// Writes `meshes` as a binary glTF file, Y up and mirrored on x out of the engine's axes.
///
/// Each mesh is one node with the mesh's transform, and one primitive per submesh. A material
/// is written once per entry path, with its base color texture from `textures` where it has
/// one. Writes an [`ExportedMesh`] with `container` into the extras of each glTF mesh. A
/// reimport matches map meshes against it.
///
/// # Errors
///
/// Fails if the document cannot be encoded.
pub fn write_glb(
    meshes: &[ExportMesh],
    container: &str,
    textures: &HashMap<String, ExportTexture>,
) -> Result<Vec<u8>, ExportError> {
    let mut glb = Glb::default();
    let mut materials: IndexSet<&str> = IndexSet::new();
    let mut gltf_meshes = Vec::with_capacity(meshes.len());
    let mut nodes = Vec::with_capacity(meshes.len());

    for (at, mesh) in meshes.iter().enumerate() {
        let mirrored = |vectors: &[Vec3]| -> Vec<f32> {
            vectors
                .iter()
                .flat_map(|v| (*v * MIRROR).to_array())
                .collect()
        };
        let flat =
            |vectors: &[Vec2]| -> Vec<f32> { vectors.iter().flat_map(|v| v.to_array()).collect() };

        let mut attributes = serde_json::Map::new();
        let position = glb.floats(&mirrored(&mesh.positions), 3, "VEC3", true);
        attributes.insert("POSITION".to_owned(), json!(position));
        if let Some(normals) = &mesh.normals {
            attributes.insert(
                "NORMAL".to_owned(),
                json!(glb.floats(&mirrored(normals), 3, "VEC3", false)),
            );
        }
        if let Some(uv0) = &mesh.uv0 {
            attributes.insert(
                "TEXCOORD_0".to_owned(),
                json!(glb.floats(&flat(uv0), 2, "VEC2", false)),
            );
        }
        if let Some(uv1) = &mesh.uv1 {
            attributes.insert(
                "TEXCOORD_1".to_owned(),
                json!(glb.floats(&flat(uv1), 2, "VEC2", false)),
            );
        }
        if let Some(colors) = &mesh.colors {
            let bytes: Vec<u8> = colors.iter().flatten().copied().collect();
            let view = glb.view(&bytes, Some(ARRAY_BUFFER));
            let accessor = glb.accessor(json!({
                "bufferView": view,
                "componentType": UNSIGNED_BYTE,
                "normalized": true,
                "count": colors.len(),
                "type": "VEC4",
            }));
            attributes.insert("COLOR_0".to_owned(), json!(accessor));
        }

        let primitives: Vec<Value> = mesh
            .parts
            .iter()
            .map(|part| {
                let bytes: Vec<u8> = part
                    .indices
                    .iter()
                    .flat_map(|index| index.to_le_bytes())
                    .collect();
                let view = glb.view(&bytes, Some(ELEMENT_ARRAY_BUFFER));
                let indices = glb.accessor(json!({
                    "bufferView": view,
                    "componentType": UNSIGNED_SHORT,
                    "count": part.indices.len(),
                    "type": "SCALAR",
                }));
                json!({
                    "attributes": attributes,
                    "indices": indices,
                    "material": materials.insert_full(part.material.as_str()).0,
                })
            })
            .collect();

        let exported = ExportedMesh {
            mesh: mesh.index,
            container: container.to_owned(),
            vertices: mesh.positions.len() as u32,
        };
        gltf_meshes.push(json!({
            "name": mesh.name,
            "primitives": primitives,
            "extras": { EXPORTED_KEY: exported },
        }));

        let mirror = Mat4::from_scale(MIRROR);
        let mut node = json!({ "name": mesh.name, "mesh": at });
        if mesh.transform != Mat4::IDENTITY {
            node["matrix"] = json!((mirror * mesh.transform * mirror).to_cols_array());
        }
        nodes.push(node);
    }

    let mut images = Vec::new();
    let mut gltf_textures = Vec::new();
    let gltf_materials: Vec<Value> = materials
        .iter()
        .map(|&path| {
            let mut pbr = json!({ "metallicFactor": 0.0, "roughnessFactor": 1.0 });
            if let Some(texture) = textures.get(path) {
                let view = glb.view(&texture.bytes, None);
                images.push(json!({ "bufferView": view, "mimeType": texture.mime }));
                gltf_textures.push(json!({ "source": images.len() - 1, "sampler": 0 }));
                pbr["baseColorTexture"] = json!({ "index": gltf_textures.len() - 1 });
            }
            json!({ "name": path, "pbrMetallicRoughness": pbr })
        })
        .collect();

    let mut document = json!({
        "asset": { "version": "2.0", "generator": "LTK Manager" },
        "scene": 0,
        "scenes": [{ "nodes": (0..nodes.len()).collect::<Vec<_>>() }],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "materials": gltf_materials,
        "accessors": glb.accessors,
        "bufferViews": glb.views,
        "buffers": [{ "byteLength": glb.bin.len() }],
    });
    if !images.is_empty() {
        document["images"] = json!(images);
        document["textures"] = json!(gltf_textures);
        document["samplers"] = json!([{ "wrapS": REPEAT, "wrapT": REPEAT }]);
    }

    let mut text = serde_json::to_vec(&document)?;
    text.resize(text.len().next_multiple_of(4), b' ');
    let mut bin = glb.bin;
    bin.resize(bin.len().next_multiple_of(4), 0);

    let length = 12 + 8 + text.len() + 8 + bin.len();
    let mut out = Vec::with_capacity(length);
    for word in [
        GLB_MAGIC,
        GLB_VERSION,
        length as u32,
        text.len() as u32,
        JSON_CHUNK,
    ] {
        out.extend(word.to_le_bytes());
    }
    out.extend(text);
    for word in [bin.len() as u32, BIN_CHUNK] {
        out.extend(word.to_le_bytes());
    }
    out.extend(bin);
    Ok(out)
}

#[cfg(test)]
mod tests;
