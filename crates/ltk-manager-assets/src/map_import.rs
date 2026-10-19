//! Reads the meshes of a model file and lowers them into map meshes, for the map editor's
//! import. "Adding meshes" in docs/ux/MAP_EDITOR.md.

mod gltf_model;
mod nvr_model;
mod ufbx_model;

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use glam::{Vec2, Vec3};
use image::RgbaImage;
use image::imageops::FilterType;
use ltk_manager_base::error::{AppError, DomainError, ErrorKind};
use ltk_mapgeo::EnvironmentMesh;
use ltk_mesh::mem::IndexBuffer;
use ltk_mesh::mem::vertex::{
    VertexBuffer, VertexBufferDescription, VertexBufferUsage, VertexElement,
};
use ltk_texture::Tex;
use ltk_texture::tex::{EncodeFormat, EncodeOptions};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use fs_err as fs;

/// The most vertices one map mesh holds, since its indices are 16-bit.
pub const MAX_MESH_VERTICES: usize = u16::MAX as usize;

/// Why a model file could not be read.
#[derive(Debug, Error)]
pub enum ImportError {
    /// The extension is not one the importer reads.
    #[error("Model files with the extension '{0}' cannot be imported")]
    Unsupported(String),

    /// The file could not be read.
    #[error(transparent)]
    Io(#[from] std::io::Error),

    /// The glTF reader refused the file.
    #[error("The glTF file could not be read: {0}")]
    Gltf(#[from] gltf::Error),

    /// The FBX or OBJ reader refused the file.
    #[error("The model file could not be read: {0}")]
    Ufbx(String),

    /// The `.nvr` reader refused the file.
    #[error("The NVR file could not be read: {0}")]
    Nvr(#[from] ltk_mapgeo::NvrError),

    /// A texture could not be decoded.
    #[error("The texture could not be read: {0}")]
    Image(#[from] image::ImageError),

    /// An embedded texture is stored in a pixel format the importer does not convert.
    #[error("The embedded texture of material {0} has an unsupported pixel format")]
    TextureFormat(usize),

    /// The `.tex` encoder refused a texture.
    #[error("The texture could not be converted to .tex: {0}")]
    Encode(String),
}

impl From<ImportError> for AppError {
    fn from(error: ImportError) -> Self {
        Self::Domain(DomainError::new(ErrorKind::Preview, error))
    }
}

/// The axis that points up in a model file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UpAxis {
    Y,
    Z,
}

/// A kind of content that the importer does not convert.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum SkippedKind {
    Skin,
    BlendShape,
    Camera,
    Light,
    Animation,
    /// Points and lines, which draw no triangle.
    Line,
}

/// A count of content of one kind that the importer skipped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct SkippedItems {
    pub kind: SkippedKind,
    pub count: u32,
}

/// Where the texture of a source material is stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TextureSource {
    /// A file beside the model, or the path the model names when no such file exists.
    File(PathBuf),
    /// Bytes stored inside the model file.
    Embedded,
}

/// A material of a model file.
#[derive(Debug, Clone, PartialEq)]
pub struct SourceMaterial {
    pub name: String,
    /// The base color texture, and none if the material has none.
    pub texture: Option<TextureSource>,
    /// The material draws with alpha.
    pub alpha: bool,
}

/// The triangles of one source material, as indices into the vertices of their mesh.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourcePart {
    pub material: usize,
    pub indices: Vec<u32>,
}

/// The extras key that the map export writes a mesh's [`ExportedMesh`] under.
pub(crate) const EXPORTED_KEY: &str = "ltkManager";

/// The map mesh that a mesh of an exported glTF file was written from, read from its extras.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ExportedMesh {
    /// The index of the mesh in its `.mapgeo` at the export.
    pub mesh: u32,
    /// The entry path of the map's `MapContainer`.
    pub container: String,
    /// The vertex count of the mesh at the export. A reimport compares it to detect a stale
    /// index.
    pub vertices: u32,
}

/// A mesh of a model file, with its node transforms applied, in the file's axes and units.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SourceMesh {
    pub name: String,
    /// The map mesh that the glTF mesh was exported from. `None` if the extras have none.
    pub exported: Option<ExportedMesh>,
    pub positions: Vec<Vec3>,
    pub normals: Option<Vec<Vec3>>,
    pub uv0: Option<Vec<Vec2>>,
    /// The second UV set, which lands as the lightmap UV.
    pub uv1: Option<Vec<Vec2>>,
    /// RGBA.
    pub colors: Option<Vec<[u8; 4]>>,
    pub parts: Vec<SourcePart>,
}

impl SourceMesh {
    fn triangle_count(&self) -> usize {
        self.parts.iter().map(|part| part.indices.len() / 3).sum()
    }
}

/// The meshes and materials of a model file, and what it states about its axes and units.
#[derive(Debug, Clone, PartialEq)]
pub struct ModelFile {
    pub meshes: Vec<SourceMesh>,
    pub materials: Vec<SourceMaterial>,
    /// Engine units per file unit.
    pub scale: f32,
    pub up: UpAxis,
    pub skipped: Vec<SkippedItems>,
}

/// One mesh of a model file, as the import dialog lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ModelMeshSummary {
    pub name: String,
    pub vertices: u32,
    pub triangles: u32,
    /// The source materials that the mesh draws with, by index.
    pub materials: Vec<u32>,
    /// The map mesh that the glTF mesh was exported from. `None` if the extras have none.
    pub exported: Option<ExportedMesh>,
}

/// One material of a model file, as the import dialog lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ModelMaterialSummary {
    pub name: String,
    /// The texture file, and none for an embedded texture or no texture.
    pub texture: Option<String>,
    /// The texture is stored inside the model file.
    pub embedded: bool,
    /// The material names a texture file that does not exist.
    pub missing: bool,
    pub alpha: bool,
}

/// What a model file holds, as the import dialog shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ModelSummary {
    pub meshes: Vec<ModelMeshSummary>,
    pub materials: Vec<ModelMaterialSummary>,
    /// Engine units per file unit, from the file's unit setting, else 1.
    pub scale: f32,
    pub up: UpAxis,
    pub skipped: Vec<SkippedItems>,
}

impl ModelFile {
    /// Describes the file for the import dialog.
    #[must_use]
    pub fn summary(&self) -> ModelSummary {
        ModelSummary {
            meshes: self
                .meshes
                .iter()
                .map(|mesh| {
                    let mut materials: Vec<u32> =
                        mesh.parts.iter().map(|part| part.material as u32).collect();
                    materials.dedup();
                    ModelMeshSummary {
                        name: mesh.name.clone(),
                        vertices: mesh.positions.len() as u32,
                        triangles: mesh.triangle_count() as u32,
                        materials,
                        exported: mesh.exported.clone(),
                    }
                })
                .collect(),
            materials: self
                .materials
                .iter()
                .map(|material| {
                    let file = match &material.texture {
                        Some(TextureSource::File(path)) => Some(path),
                        _ => None,
                    };
                    ModelMaterialSummary {
                        name: material.name.clone(),
                        texture: file.map(|path| path.display().to_string()),
                        embedded: material.texture == Some(TextureSource::Embedded),
                        missing: file.is_some_and(|path| !path.is_file()),
                        alpha: material.alpha,
                    }
                })
                .collect(),
            scale: self.scale,
            up: self.up,
            skipped: self.skipped.clone(),
        }
    }
}

/// The map mesh that a reimport replaces, as [`reimport_source`] compares it.
#[derive(Debug, Clone, Copy)]
pub struct ReimportTarget<'a> {
    pub index: u32,
    pub name: &'a str,
    /// The entry path of the map's `MapContainer`.
    pub container: &'a str,
    pub vertices: u32,
}

/// Returns the mesh of a model file that replaces `target`.
///
/// Returns mesh 0 if the file has one mesh. Otherwise returns the mesh whose [`ExportedMesh`]
/// has the container and index of `target`, then the mesh whose name equals `target.name`.
/// Returns `None` if no mesh matches, or if the matching [`ExportedMesh`] has another vertex
/// count, because its index is stale.
#[must_use]
pub fn reimport_source(meshes: &[ModelMeshSummary], target: ReimportTarget<'_>) -> Option<u32> {
    if meshes.len() == 1 {
        return Some(0);
    }

    let exported = meshes.iter().position(|mesh| {
        mesh.exported.as_ref().is_some_and(|exported| {
            exported.container == target.container && exported.mesh == target.index
        })
    });
    if let Some(at) = exported {
        let vertices = meshes[at]
            .exported
            .as_ref()
            .map(|exported| exported.vertices);
        return (vertices == Some(target.vertices)).then_some(at as u32);
    }

    meshes
        .iter()
        .position(|mesh| mesh.name == target.name)
        .map(|at| at as u32)
}

/// Lowers the meshes `meshes` of `model` with `scale` and `up` into the buffer that the import
/// dialog's preview draws: the vertex count and index count as `u32`, then three `f32` per vertex
/// in the engine's space, then the `u32` indices. Skips an index past the model's meshes.
#[must_use]
pub fn preview_buffer(model: &ModelFile, meshes: &[usize], scale: f32, up: UpAxis) -> Vec<u8> {
    let mut positions: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    for mesh in meshes.iter().filter_map(|&at| model.meshes.get(at)) {
        for lowered in lower(mesh, scale, up) {
            let base = (positions.len() / 3) as u32;
            let vertices = lowered
                .vertices
                .accessor::<Vec3>(ltk_mesh::mem::vertex::ElementName::Position)
                .expect("a lowered mesh carries positions");
            for vertex in 0..lowered.vertices.count() {
                positions.extend(vertices.get(vertex).to_array());
            }
            indices.extend(
                (0..lowered.indices.count()).map(|at| base + u32::from(lowered.indices.get(at))),
            );
        }
    }

    let mut bytes = Vec::with_capacity(8 + 4 * (positions.len() + indices.len()));
    bytes.extend(((positions.len() / 3) as u32).to_le_bytes());
    bytes.extend((indices.len() as u32).to_le_bytes());
    for value in positions {
        bytes.extend(value.to_le_bytes());
    }
    for index in indices {
        bytes.extend(index.to_le_bytes());
    }
    bytes
}

/// The lowercased extension of `path`.
fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// Reads the meshes and materials of the model file at `path`.
///
/// # Errors
///
/// Fails if the extension is not `.gltf`, `.glb`, `.fbx`, `.obj` or `.nvr`, or if the file
/// cannot be read.
pub fn read_model(path: &Path) -> Result<ModelFile, ImportError> {
    match extension(path).as_str() {
        "gltf" | "glb" => gltf_model::read(path),
        "fbx" | "obj" => ufbx_model::read(path),
        "nvr" => nvr_model::read(path),
        other => Err(ImportError::Unsupported(other.to_owned())),
    }
}

/// Reads the base color texture of material `material` of the model file at `path`.
///
/// Returns `None` if the material has no texture or its texture file does not exist.
///
/// # Errors
///
/// Fails if the model or the texture cannot be read.
pub fn read_texture(path: &Path, material: usize) -> Result<Option<RgbaImage>, ImportError> {
    let model = read_model(path)?;
    match model
        .materials
        .get(material)
        .and_then(|m| m.texture.clone())
    {
        None => Ok(None),
        Some(TextureSource::File(file)) if !file.is_file() => Ok(None),
        Some(TextureSource::File(file)) => read_image(&file).map(Some),
        Some(TextureSource::Embedded) => match extension(path).as_str() {
            "gltf" | "glb" => gltf_model::read_embedded_texture(path, material).map(Some),
            _ => ufbx_model::read_embedded_texture(path, material).map(Some),
        },
    }
}

/// Encodes `image` as the bytes of a mipmapped `.tex`: BC3 with `alpha`, else BC1. A side that
/// is not a multiple of 4 is resized up to one.
///
/// # Errors
///
/// Fails if the encoder refuses the image.
pub fn encode_texture(image: &RgbaImage, alpha: bool) -> Result<Vec<u8>, ImportError> {
    let (width, height) = image.dimensions();
    let aligned = (
        width.max(1).next_multiple_of(4),
        height.max(1).next_multiple_of(4),
    );
    let resized;
    let image = if aligned == (width, height) {
        image
    } else {
        resized = image::imageops::resize(image, aligned.0, aligned.1, FilterType::Triangle);
        &resized
    };

    let format = if alpha {
        EncodeFormat::Bc3 {
            weigh_colour_by_alpha: false,
        }
    } else {
        EncodeFormat::Bc1 {
            weigh_colour_by_alpha: false,
        }
    };
    let tex = Tex::encode_rgba_image(image, EncodeOptions::new(format).with_mipmaps())
        .map_err(|error| ImportError::Encode(error.to_string()))?;
    let mut bytes = Vec::new();
    tex.write(&mut bytes)?;
    Ok(bytes)
}

/// Reads the image file at `path`.
///
/// # Errors
///
/// Fails if the file cannot be read or decoded.
pub fn read_image(path: &Path) -> Result<RgbaImage, ImportError> {
    let bytes = fs::read(path)?;
    Ok(image::load_from_memory(&bytes)?.to_rgba8())
}

/// One map mesh lowered from a source mesh.
#[derive(Debug, Clone)]
pub struct LoweredMesh {
    pub vertices: VertexBuffer,
    pub indices: IndexBuffer<u16>,
    pub submeshes: Vec<LoweredSubmesh>,
}

/// A draw range of a lowered mesh and the source material that it draws with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LoweredSubmesh {
    pub material: usize,
    pub start_index: u32,
    pub index_count: u32,
    pub min_vertex: u32,
    pub max_vertex: u32,
}

/// Converts a point or direction of a model file into the engine's axes.
///
/// The engine mirrors x against a right-handed Y-up space, which is the flip that
/// `AXIS_SIGN` reverts in the viewport.
fn to_engine(v: Vec3, up: UpAxis) -> Vec3 {
    match up {
        UpAxis::Y => Vec3::new(-v.x, v.y, v.z),
        UpAxis::Z => Vec3::new(-v.x, v.z, -v.y),
    }
}

/// Returns the area-weighted vertex normals of the triangles of `mesh`.
fn computed_normals(mesh: &SourceMesh) -> Vec<Vec3> {
    let mut normals = vec![Vec3::ZERO; mesh.positions.len()];
    for part in &mesh.parts {
        for triangle in part.indices.as_chunks::<3>().0 {
            let [a, b, c] = triangle.map(|vertex| vertex as usize);
            if [a, b, c].iter().any(|&vertex| vertex >= normals.len()) {
                continue;
            }
            let face = (mesh.positions[b] - mesh.positions[a])
                .cross(mesh.positions[c] - mesh.positions[a]);
            for vertex in [a, b, c] {
                normals[vertex] += face;
            }
        }
    }
    normals
        .into_iter()
        .map(|normal| normal.try_normalize().unwrap_or(Vec3::Y))
        .collect()
}

/// A map mesh while [`lower`] fills it.
#[derive(Default)]
struct Chunk {
    /// The source vertex of each vertex.
    sources: Vec<u32>,
    remap: HashMap<u32, u16>,
    indices: Vec<u16>,
    submeshes: Vec<LoweredSubmesh>,
}

impl Chunk {
    fn open_submesh(&mut self, material: usize) {
        self.submeshes.push(LoweredSubmesh {
            material,
            start_index: self.indices.len() as u32,
            index_count: 0,
            min_vertex: 0,
            max_vertex: 0,
        });
    }

    /// Sets the count and vertex range of the last submesh, and drops it if it is empty.
    fn close_submesh(&mut self) {
        let Some(submesh) = self.submeshes.last_mut() else {
            return;
        };
        let range = &self.indices[submesh.start_index as usize..];
        if range.is_empty() {
            self.submeshes.pop();
            return;
        }
        submesh.index_count = range.len() as u32;
        submesh.min_vertex = u32::from(*range.iter().min().expect("the range is not empty"));
        submesh.max_vertex = u32::from(*range.iter().max().expect("the range is not empty"));
    }
}

/// Lowers `mesh` into map meshes in the engine's axes, scaled by `scale`.
///
/// Normals are computed where the mesh has none, and for each vertex whose normal is zero. A
/// mesh with more than [`MAX_MESH_VERTICES`] vertices or more than
/// [`EnvironmentMesh::MAX_SUBMESH_COUNT`] parts is split into several meshes. A triangle with an
/// index past the vertices is skipped.
#[must_use]
pub fn lower(mesh: &SourceMesh, scale: f32, up: UpAxis) -> Vec<LoweredMesh> {
    let normals: Cow<'_, [Vec3]> = match &mesh.normals {
        Some(normals) if !normals.contains(&Vec3::ZERO) => Cow::Borrowed(normals),
        Some(normals) => Cow::Owned(
            normals
                .iter()
                .zip(computed_normals(mesh))
                .map(|(&held, computed)| if held == Vec3::ZERO { computed } else { held })
                .collect(),
        ),
        None => Cow::Owned(computed_normals(mesh)),
    };
    let vertex_count = mesh.positions.len();

    let mut chunks = Vec::new();
    let mut chunk = Chunk::default();
    for part in &mesh.parts {
        if chunk.submeshes.len() == EnvironmentMesh::MAX_SUBMESH_COUNT {
            chunks.push(std::mem::take(&mut chunk));
        }
        chunk.open_submesh(part.material);

        for triangle in part.indices.as_chunks::<3>().0 {
            if triangle
                .iter()
                .any(|&vertex| vertex as usize >= vertex_count)
            {
                continue;
            }

            let mut added = triangle.to_vec();
            added.sort_unstable();
            added.dedup();
            let new = added
                .iter()
                .filter(|vertex| !chunk.remap.contains_key(vertex))
                .count();
            if chunk.sources.len() + new > MAX_MESH_VERTICES {
                chunk.close_submesh();
                chunks.push(std::mem::take(&mut chunk));
                chunk.open_submesh(part.material);
            }

            for &vertex in triangle {
                let next = chunk.sources.len() as u16;
                let index = *chunk.remap.entry(vertex).or_insert(next);
                if index == next {
                    chunk.sources.push(vertex);
                }
                chunk.indices.push(index);
            }
        }
        chunk.close_submesh();
    }
    chunks.push(chunk);

    chunks
        .into_iter()
        .filter(|chunk| !chunk.submeshes.is_empty())
        .map(|chunk| LoweredMesh {
            vertices: vertex_buffer(mesh, &normals, &chunk.sources, scale, up),
            indices: IndexBuffer::new(
                chunk
                    .indices
                    .iter()
                    .flat_map(|index| index.to_le_bytes())
                    .collect(),
            ),
            submeshes: chunk.submeshes,
        })
        .collect()
}

/// Writes the source vertices `sources` of `mesh` as one interleaved vertex buffer.
fn vertex_buffer(
    mesh: &SourceMesh,
    normals: &[Vec3],
    sources: &[u32],
    scale: f32,
    up: UpAxis,
) -> VertexBuffer {
    let mut elements = vec![
        VertexElement::POSITION,
        VertexElement::NORMAL,
        VertexElement::TEXCOORD_0,
    ];
    if mesh.uv1.is_some() {
        elements.push(VertexElement::TEXCOORD_7);
    }
    if mesh.colors.is_some() {
        elements.push(VertexElement::PRIMARY_COLOR);
    }
    let description = VertexBufferDescription::new(VertexBufferUsage::Static, elements);

    let mut bytes = Vec::with_capacity(sources.len() * description.vertex_size());
    for &source in sources {
        let at = source as usize;
        push_floats(
            &mut bytes,
            &(to_engine(mesh.positions[at], up) * scale).to_array(),
        );
        push_floats(
            &mut bytes,
            &to_engine(normals[at], up).normalize_or_zero().to_array(),
        );
        let uv0 = mesh.uv0.as_ref().map_or(Vec2::ZERO, |uv| uv[at]);
        push_floats(&mut bytes, &uv0.to_array());
        if let Some(uv1) = &mesh.uv1 {
            push_floats(&mut bytes, &uv1[at].to_array());
        }
        /* `PRIMARY_COLOR` is packed blue first. */
        if let Some(colors) = &mesh.colors {
            let [r, g, b, a] = colors[at];
            bytes.extend_from_slice(&[b, g, r, a]);
        }
    }
    VertexBuffer::new(description, bytes)
}

fn push_floats(bytes: &mut Vec<u8>, values: &[f32]) {
    for value in values {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
}

#[cfg(test)]
mod tests;
