//! One map as the geometry buffer a viewport uploads.
//!
//! A `.mapgeo` reads through `ltk_mapgeo`. Every mesh lands in one flat block per
//! channel with its own transform baked in, so a whole map is one buffer, one upload and
//! one `BufferGeometry`, and a draw call is a submesh.
//!
//! Positions keep the engine's own space and units, as `LTKG` does. The axis mirror is
//! the viewport's.
//!
//! # The buffer
//!
//! Little-endian throughout. Every block starts on a four-byte boundary and the strings
//! are last, so the reader takes a typed array over the bytes rather than copying them.
//!
//! ```text
//! magic         u32   0x4D4B544C, `LTKM`
//! version       u32   2
//! flags         u32   bit 0 uv1 present
//! vertexCount   u32
//! indexCount    u32
//! meshCount     u32
//! submeshCount  u32
//! positions     f32 * vertexCount * 3   world space
//! normals       f32 * vertexCount * 3
//! uv0           f32 * vertexCount * 2
//! uv1           f32 * vertexCount * 2   only under bit 0
//! indices       u32 * indexCount        absolute into the flat vertex list
//! meshes        meshCount * { min 3f32, max 3f32, visibility u8, quality u8,
//!                             flags u8, reserved u8, firstSubmesh u32, submeshCount u32 }
//!                             flags: bit 0 backface culling disabled
//!                                    bit 1 placed through a map region
//! submeshes     submeshCount * { startIndex u32, indexCount u32, material u32 }
//! lights        meshCount * { baked u32, bakedScale 2f32, bakedBias 2f32,
//!                             stationary u32, stationaryScale 2f32, stationaryBias 2f32 }
//! strings       count u32, then count * { length u32, utf8[length] }
//! lightmaps     count u32, then count * { length u32, utf8[length] }
//! ```
//!
//! A submesh's `material` indexes the string table, which holds each material once. A
//! mesh's `visibility` is the layer mask the viewport filters on, and its `quality` is
//! carried unread. Its bounds are computed from the baked vertices rather than taken from
//! the file, which states them in a region's space for a region-anchored mesh.
//!
//! A mesh's `lights` record names its baked and stationary light maps in the lightmaps
//! table, `0xFFFFFFFF` for a channel the mesh carries none of, each with the scale and
//! bias its `uv1` is read through. The Rift carries none, and Map12 and Map30 carry one
//! per mesh.

use std::io::Cursor;

use glam::{Mat3, Vec2, Vec3};
use indexmap::IndexSet;
use ltk_mapgeo::{EnvironmentAsset, EnvironmentAssetChannel, EnvironmentMesh};
use ltk_mesh::mem::VertexBuffer;
use ltk_mesh::mem::vertex::ElementName;

use super::{PreviewError, count_of};

/// The word a map buffer opens with, `LTKM` in the order the buffer is written in.
const MAGIC: u32 = 0x4D4B_544C;

/// The layout this module writes.
const VERSION: u32 = 2;

/// The `flags` bit under which a `uv1` block follows the `uv0` block.
///
/// Bits 1 and 2 are reserved for vertex colour and `Texcoord5`, which arrive together on
/// the meshes that have either and which nothing draws yet.
const HAS_UV1: u32 = 1 << 0;

/// The per-mesh `flags` bit set where the game draws the mesh without backface culling.
const MESH_CULL_DISABLED: u8 = 1 << 0;

/// The per-mesh `flags` bit set where the game places the mesh through a map region
/// rather than at the world origin, so the transform baked here is not where it lands.
///
/// 13 of Summoner's Rift's 586 meshes and 1 of Map453's 449, and none at all on Map12 or
/// Map30. Reading a region needs the placeables the backdrop does not draw, so the bit
/// marks the mesh rather than fixing it.
const MESH_REGION_ANCHORED: u8 = 1 << 1;

/// The second UV set, which is the lightmap channel and never `Texcoord1`.
const UV1_ELEMENT: ElementName = ElementName::Texcoord7;

/// What a mesh lacking a normal takes, so one missing stream costs its shading rather
/// than the whole map.
const DEFAULT_NORMAL: Vec3 = Vec3::Y;

/// Bytes one mesh record occupies, which is what keeps the table's records aligned.
const MESH_RECORD: usize = 36;

/// Bytes one submesh record occupies.
const SUBMESH_RECORD: usize = 12;

/// Bytes one mesh's light record occupies.
const LIGHT_RECORD: usize = 40;

/// The lightmap index of a channel the mesh carries no texture for.
const NO_TEXTURE: u32 = u32::MAX;

/// Read a map into the buffer a viewport uploads.
///
/// # Errors
///
/// Fails with [`PreviewError::MapRead`] where the bytes are not a `.mapgeo` this build
/// reads, with [`PreviewError::MapVertexLayout`] where a mesh carries no positions this
/// build can decode, with [`PreviewError::MeshOutOfBounds`] where a submesh names
/// indices or vertices the file does not hold, and with [`PreviewError::BufferTooLarge`]
/// where the map holds more of something than one buffer counts.
pub fn render(bytes: &[u8]) -> Result<Vec<u8>, PreviewError> {
    let asset = EnvironmentAsset::from_reader(&mut Cursor::new(bytes))?;
    Map::of(&asset)?.encode()
}

/// One map's geometry, in the blocks the buffer holds it in.
struct Map {
    /// Three per vertex, in world space.
    positions: Vec<f32>,
    /// Three per vertex.
    normals: Vec<f32>,
    /// Two per vertex.
    uv0: Vec<f32>,
    /// Two per vertex, for a map where any mesh carries the lightmap channel.
    uv1: Option<Vec<f32>>,
    /// Absolute into the flat vertex list, so one index block addresses every mesh.
    indices: Vec<u32>,
    meshes: Vec<Mesh>,
    /// Ordered by mesh, which is what lets a mesh name a run of them.
    submeshes: Vec<Submesh>,
    /// One per mesh, in mesh order.
    lights: Vec<Light>,
    /// Each material once, in the order the submeshes first name them.
    materials: IndexSet<String>,
    /// Each light map once, in the order the meshes first name them.
    lightmaps: IndexSet<String>,
}

/// The light maps one mesh is lit by.
struct Light {
    baked: Channel,
    stationary: Channel,
}

/// One texture channel of a mesh, and the transform its `uv1` is read through.
struct Channel {
    /// Into the lightmaps table, or [`NO_TEXTURE`].
    texture: u32,
    scale: Vec2,
    bias: Vec2,
}

/// One drawable object of a map, and the fields a viewport filters it by.
struct Mesh {
    min: Vec3,
    max: Vec3,
    visibility: u8,
    quality: u8,
    flags: u8,
    first_submesh: u32,
    submesh_count: u32,
}

/// One run of the index block, drawn with one material.
struct Submesh {
    start_index: u32,
    index_count: u32,
    material: u32,
}

impl Map {
    /// Every mesh of `asset`, baked into world space and concatenated.
    ///
    /// # Errors
    ///
    /// Fails for the reasons [`render`] documents.
    fn of(asset: &EnvironmentAsset) -> Result<Self, PreviewError> {
        let vertices: usize = asset
            .meshes()
            .iter()
            .map(|mesh| mesh.vertex_count() as usize)
            .sum();
        /* Whole-buffer rather than per-mesh, because one flat block cannot be ragged.
        Summoner's Rift carries no lightmap channel at all and Map12 carries it on all
        but twelve meshes, so the cost lands per map rather than per mesh either way. */
        let lightmapped = asset
            .meshes()
            .iter()
            .any(|mesh| stream(asset, mesh, UV1_ELEMENT).is_some());

        let mut map = Self {
            positions: Vec::with_capacity(vertices * 3),
            normals: Vec::with_capacity(vertices * 3),
            uv0: Vec::with_capacity(vertices * 2),
            uv1: lightmapped.then(|| Vec::with_capacity(vertices * 2)),
            indices: Vec::new(),
            meshes: Vec::with_capacity(asset.mesh_count()),
            submeshes: Vec::new(),
            lights: Vec::with_capacity(asset.mesh_count()),
            materials: IndexSet::new(),
            lightmaps: IndexSet::new(),
        };

        for mesh in asset.meshes() {
            map.push(asset, mesh)?;
        }
        Ok(map)
    }

    /// Bake one mesh's vertices into the blocks, and its submeshes into the tables.
    fn push(
        &mut self,
        asset: &EnvironmentAsset,
        mesh: &EnvironmentMesh,
    ) -> Result<(), PreviewError> {
        let base = count_of(self.positions.len() / 3)?;
        let count = mesh.vertex_count() as usize;

        let positions = stream(asset, mesh, ElementName::Position)
            .and_then(|buffer| buffer.accessor::<Vec3>(ElementName::Position))
            .ok_or(PreviewError::MapVertexLayout)?;
        let normals = stream(asset, mesh, ElementName::Normal)
            .and_then(|buffer| buffer.accessor::<Vec3>(ElementName::Normal));
        let uv0 = stream(asset, mesh, ElementName::Texcoord0)
            .and_then(|buffer| buffer.accessor::<Vec2>(ElementName::Texcoord0));
        let uv1 = stream(asset, mesh, UV1_ELEMENT)
            .and_then(|buffer| buffer.accessor::<Vec2>(UV1_ELEMENT));

        let transform = *mesh.transform();
        /* A non-uniform scale bends a normal that is only rotated, so the normals take
        the inverse transpose of the upper 3 by 3 rather than the transform itself. */
        let rotation = Mat3::from_mat4(transform).inverse().transpose();

        let mut min = Vec3::splat(f32::INFINITY);
        let mut max = Vec3::splat(f32::NEG_INFINITY);

        for vertex in 0..count {
            let world = (transform * positions.get(vertex).extend(1.0)).truncate();
            min = min.min(world);
            max = max.max(world);
            self.positions.extend(world.to_array());

            let normal = normals
                .as_ref()
                .map_or(DEFAULT_NORMAL, |block| rotation * block.get(vertex));
            self.normals.extend(unit(normal).to_array());

            self.uv0.extend(
                uv0.as_ref()
                    .map_or(Vec2::ZERO, |block| block.get(vertex))
                    .to_array(),
            );
            if let Some(block) = &mut self.uv1 {
                block.extend(
                    uv1.as_ref()
                        .map_or(Vec2::ZERO, |block| block.get(vertex))
                        .to_array(),
                );
            }
        }

        let buffer = asset
            .index_buffer(mesh.index_buffer_id())
            .ok_or(PreviewError::MeshOutOfBounds)?;
        let first_submesh = count_of(self.submeshes.len())?;

        for submesh in mesh.submeshes() {
            let start = usize::try_from(submesh.start_index())
                .map_err(|_| PreviewError::MeshOutOfBounds)?;
            let length = usize::try_from(submesh.index_count())
                .map_err(|_| PreviewError::MeshOutOfBounds)?;
            let end = start
                .checked_add(length)
                .filter(|end| *end <= buffer.count())
                .ok_or(PreviewError::MeshOutOfBounds)?;

            let start_index = count_of(self.indices.len())?;
            for at in start..end {
                let index = buffer.get(at) as usize;
                if index >= count {
                    return Err(PreviewError::MeshOutOfBounds);
                }
                self.indices.push(base + index as u32);
            }
            self.submeshes.push(Submesh {
                start_index,
                index_count: count_of(self.indices.len())? - start_index,
                material: count_of(self.materials.insert_full(submesh.material().to_owned()).0)?,
            });
        }

        /* Computed rather than the file's own `bounding_box`, which a region-anchored
        mesh states in its region's space and not in the world's. A bound that disagrees
        with the vertices beside it is worse than no bound. */
        let mut flags = 0;
        if mesh.disable_backface_culling() {
            flags |= MESH_CULL_DISABLED;
        }
        if mesh.region_path_hash() != 0 {
            flags |= MESH_REGION_ANCHORED;
        }
        self.meshes.push(Mesh {
            min: if count == 0 { Vec3::ZERO } else { min },
            max: if count == 0 { Vec3::ZERO } else { max },
            visibility: mesh.visibility().bits(),
            quality: mesh.quality().bits(),
            flags,
            first_submesh,
            submesh_count: count_of(self.submeshes.len())? - first_submesh,
        });
        let baked = self.channel(mesh.baked_light())?;
        let stationary = self.channel(mesh.stationary_light())?;
        self.lights.push(Light { baked, stationary });
        Ok(())
    }

    /// `channel` with its texture in the lightmaps table, or none for an empty path.
    fn channel(&mut self, channel: &EnvironmentAssetChannel) -> Result<Channel, PreviewError> {
        let texture = if channel.texture().is_empty() {
            NO_TEXTURE
        } else {
            count_of(self.lightmaps.insert_full(channel.texture().to_owned()).0)?
        };
        Ok(Channel {
            texture,
            scale: channel.scale(),
            bias: channel.offset(),
        })
    }

    /// The map as the buffer this module documents.
    fn encode(&self) -> Result<Vec<u8>, PreviewError> {
        let header = [
            MAGIC,
            VERSION,
            if self.uv1.is_some() { HAS_UV1 } else { 0 },
            count_of(self.positions.len() / 3)?,
            count_of(self.indices.len())?,
            count_of(self.meshes.len())?,
            count_of(self.submeshes.len())?,
        ];
        let blocks = [
            Some(&self.positions),
            Some(&self.normals),
            Some(&self.uv0),
            self.uv1.as_ref(),
        ];

        let floats: usize = blocks.iter().flatten().map(|block| block.len()).sum();
        let strings: usize = 8 + self
            .materials
            .iter()
            .chain(&self.lightmaps)
            .map(|text| 4 + text.len())
            .sum::<usize>();
        let mut buffer = Vec::with_capacity(
            4 * (header.len() + floats + self.indices.len())
                + MESH_RECORD * self.meshes.len()
                + SUBMESH_RECORD * self.submeshes.len()
                + LIGHT_RECORD * self.lights.len()
                + strings,
        );

        for word in header {
            buffer.extend(word.to_le_bytes());
        }
        for block in blocks.into_iter().flatten() {
            for value in block {
                buffer.extend(value.to_le_bytes());
            }
        }
        for index in &self.indices {
            buffer.extend(index.to_le_bytes());
        }
        for mesh in &self.meshes {
            for value in mesh.min.to_array().into_iter().chain(mesh.max.to_array()) {
                buffer.extend(value.to_le_bytes());
            }
            buffer.extend([mesh.visibility, mesh.quality, mesh.flags, 0]);
            buffer.extend(mesh.first_submesh.to_le_bytes());
            buffer.extend(mesh.submesh_count.to_le_bytes());
        }
        for submesh in &self.submeshes {
            buffer.extend(submesh.start_index.to_le_bytes());
            buffer.extend(submesh.index_count.to_le_bytes());
            buffer.extend(submesh.material.to_le_bytes());
        }
        for light in &self.lights {
            for channel in [&light.baked, &light.stationary] {
                buffer.extend(channel.texture.to_le_bytes());
                for value in channel
                    .scale
                    .to_array()
                    .into_iter()
                    .chain(channel.bias.to_array())
                {
                    buffer.extend(value.to_le_bytes());
                }
            }
        }
        for table in [&self.materials, &self.lightmaps] {
            buffer.extend(count_of(table.len())?.to_le_bytes());
            for text in table {
                buffer.extend(count_of(text.len())?.to_le_bytes());
                buffer.extend(text.as_bytes());
            }
        }

        Ok(buffer)
    }
}

/// The stream of `mesh` carrying `element`, of the one or two it declares.
///
/// No shipped mesh declares an element on both of its streams, so the first match is the
/// only one.
fn stream<'a>(
    asset: &'a EnvironmentAsset,
    mesh: &EnvironmentMesh,
    element: ElementName,
) -> Option<&'a VertexBuffer> {
    mesh.vertex_buffer_ids()
        .iter()
        .filter_map(|&id| asset.vertex_buffer(id))
        .find(|buffer| buffer.elements().contains_key(&element))
}

/// `normal` as a unit vector, and the default where it has no direction.
///
/// A degenerate normal survives the inverse transpose of a singular transform, and a
/// zero-length one shades black rather than reporting anything.
fn unit(normal: Vec3) -> Vec3 {
    if normal.is_finite() && normal.length_squared() > 0.0 {
        normal.normalize()
    } else {
        DEFAULT_NORMAL
    }
}

#[cfg(test)]
mod tests;
