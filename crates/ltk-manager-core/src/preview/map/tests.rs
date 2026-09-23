//! What the map buffer's bytes are, checked against a decoder written apart from the
//! encoder so the two can disagree.
//!
//! The bake itself is not here: `ltk_mapgeo` has no writer and its asset builder is
//! private, so an [`EnvironmentAsset`] cannot be made in a test. What a transform does to
//! a vertex is checked against a live install instead, by the bounding box every mesh
//! carries.

use glam::vec3;

use super::*;

/// A map buffer read back, so a round trip has two sides.
#[derive(Debug, PartialEq)]
struct Decoded {
    version: u32,
    flags: u32,
    positions: Vec<f32>,
    normals: Vec<f32>,
    uv0: Vec<f32>,
    uv1: Option<Vec<f32>>,
    indices: Vec<u32>,
    meshes: Vec<DecodedMesh>,
    submeshes: Vec<(u32, u32, u32)>,
    lights: Vec<[DecodedChannel; 2]>,
    materials: Vec<String>,
    lightmaps: Vec<String>,
}

/// One light channel as the decoder reads it back.
#[derive(Debug, PartialEq)]
struct DecodedChannel {
    texture: u32,
    scale: [f32; 2],
    bias: [f32; 2],
}

/// One mesh record as the decoder reads it back, apart from the encoder's own type.
#[derive(Debug, PartialEq)]
struct DecodedMesh {
    min: [f32; 3],
    max: [f32; 3],
    visibility: u8,
    quality: u8,
    flags: u8,
    first_submesh: u32,
    submesh_count: u32,
}

/// A position in a map buffer, for the decoder to walk.
struct Reader<'a> {
    buffer: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn word(&mut self) -> u32 {
        let value = u32::from_le_bytes(self.buffer[self.at..self.at + 4].try_into().unwrap());
        self.at += 4;
        value
    }

    fn float(&mut self) -> f32 {
        f32::from_bits(self.word())
    }

    fn floats(&mut self, count: usize) -> Vec<f32> {
        (0..count).map(|_| self.float()).collect()
    }

    fn byte(&mut self) -> u8 {
        let value = self.buffer[self.at];
        self.at += 1;
        value
    }

    fn text(&mut self) -> String {
        let length = self.word() as usize;
        let text = String::from_utf8(self.buffer[self.at..self.at + length].to_vec()).unwrap();
        self.at += length;
        text
    }
}

/// Reads the buffer [`Map::encode`] writes, off the layout the module documents.
///
/// Records every offset it reads a block at, so the alignment the format promises is
/// checked by the same walk that checks the values.
fn decode(buffer: &[u8]) -> (Decoded, Vec<usize>) {
    let mut reader = Reader { buffer, at: 0 };
    let mut offsets = Vec::new();

    assert_eq!(reader.word(), MAGIC, "the buffer opens with LTKM");
    let version = reader.word();
    let flags = reader.word();
    let vertex_count = reader.word() as usize;
    let index_count = reader.word() as usize;
    let mesh_count = reader.word() as usize;
    let submesh_count = reader.word() as usize;

    offsets.push(reader.at);
    let positions = reader.floats(vertex_count * 3);
    offsets.push(reader.at);
    let normals = reader.floats(vertex_count * 3);
    offsets.push(reader.at);
    let uv0 = reader.floats(vertex_count * 2);
    offsets.push(reader.at);
    let uv1 = ((flags & HAS_UV1) != 0).then(|| reader.floats(vertex_count * 2));

    offsets.push(reader.at);
    let indices = (0..index_count).map(|_| reader.word()).collect();

    offsets.push(reader.at);
    let meshes = (0..mesh_count)
        .map(|_| {
            let min = [reader.float(), reader.float(), reader.float()];
            let max = [reader.float(), reader.float(), reader.float()];
            let (visibility, quality, mesh_flags, reserved) =
                (reader.byte(), reader.byte(), reader.byte(), reader.byte());
            assert_eq!(reserved, 0, "the padding byte of a mesh record is zero");
            DecodedMesh {
                min,
                max,
                visibility,
                quality,
                flags: mesh_flags,
                first_submesh: reader.word(),
                submesh_count: reader.word(),
            }
        })
        .collect();

    offsets.push(reader.at);
    let submeshes = (0..submesh_count)
        .map(|_| (reader.word(), reader.word(), reader.word()))
        .collect();

    offsets.push(reader.at);
    let lights = (0..mesh_count)
        .map(|_| {
            let mut channel = || DecodedChannel {
                texture: reader.word(),
                scale: [reader.float(), reader.float()],
                bias: [reader.float(), reader.float()],
            };
            [channel(), channel()]
        })
        .collect();

    offsets.push(reader.at);
    let count = reader.word() as usize;
    let materials = (0..count).map(|_| reader.text()).collect();

    /* Past the material strings, which end wherever their lengths do: the tables are
    last so that nothing typed follows them. */
    let count = reader.word() as usize;
    let lightmaps = (0..count).map(|_| reader.text()).collect();

    assert_eq!(
        reader.at,
        buffer.len(),
        "the buffer ends where the counts do"
    );
    (
        Decoded {
            version,
            flags,
            positions,
            normals,
            uv0,
            uv1,
            indices,
            meshes,
            submeshes,
            lights,
            materials,
            lightmaps,
        },
        offsets,
    )
}

/// One mesh of one submesh, over `vertices` vertices, with whatever bounds and filters.
fn one_mesh(vertices: usize, materials: &[&str]) -> Map {
    let mut map = Map {
        positions: (0..vertices * 3).map(|n| n as f32).collect(),
        normals: (0..vertices * 3).map(|_| 0.0).collect(),
        uv0: (0..vertices * 2).map(|n| n as f32 * 0.5).collect(),
        uv1: None,
        indices: (0..vertices as u32).collect(),
        meshes: Vec::new(),
        submeshes: Vec::new(),
        lights: Vec::new(),
        materials: IndexSet::new(),
        lightmaps: IndexSet::new(),
    };
    for (at, material) in materials.iter().enumerate() {
        map.submeshes.push(Submesh {
            start_index: at as u32,
            index_count: 1,
            material: map.materials.insert_full((*material).to_owned()).0 as u32,
        });
    }
    map.meshes.push(Mesh {
        min: vec3(-1.0, -2.0, -3.0),
        max: vec3(4.0, 5.0, 6.0),
        visibility: 0b1000_0001,
        quality: 0x1f,
        flags: MESH_CULL_DISABLED,
        first_submesh: 0,
        submesh_count: materials.len() as u32,
    });
    map.lights.push(Light {
        baked: Channel {
            texture: map
                .lightmaps
                .insert_full("ASSETS/Maps/Lightmaps/Maps/MapGeometry/Map12/Base/0.tex".to_owned())
                .0 as u32,
            scale: Vec2::new(0.5, 0.25),
            bias: Vec2::new(0.125, 0.0),
        },
        stationary: Channel {
            texture: NO_TEXTURE,
            scale: Vec2::ONE,
            bias: Vec2::ZERO,
        },
    });
    map
}

#[test]
fn a_light_record_names_the_mesh_light_maps_with_their_scale_and_bias() {
    let (decoded, _) = decode(&one_mesh(3, &["a"]).encode().unwrap());

    assert_eq!(
        decoded.lights,
        vec![[
            DecodedChannel {
                texture: 0,
                scale: [0.5, 0.25],
                bias: [0.125, 0.0],
            },
            DecodedChannel {
                texture: NO_TEXTURE,
                scale: [1.0, 1.0],
                bias: [0.0, 0.0],
            },
        ]]
    );
    assert_eq!(
        decoded.lightmaps,
        vec!["ASSETS/Maps/Lightmaps/Maps/MapGeometry/Map12/Base/0.tex".to_owned()]
    );
}

#[test]
fn a_map_buffer_opens_with_its_magic_and_version() {
    let (decoded, _) = decode(&one_mesh(3, &["a"]).encode().unwrap());

    assert_eq!(decoded.version, VERSION);
    assert_eq!(MAGIC.to_le_bytes(), *b"LTKM");
}

#[test]
fn a_map_without_the_lightmap_channel_carries_no_uv1_block() {
    let (decoded, _) = decode(&one_mesh(3, &["a"]).encode().unwrap());

    assert_eq!(decoded.flags & HAS_UV1, 0);
    assert_eq!(decoded.uv1, None);
}

#[test]
fn a_lightmapped_map_carries_uv1_under_its_flag() {
    let mut map = one_mesh(3, &["a"]);
    map.uv1 = Some(vec![9.0; 6]);

    let (decoded, _) = decode(&map.encode().unwrap());

    assert_eq!(decoded.flags & HAS_UV1, HAS_UV1);
    assert_eq!(decoded.uv1, Some(vec![9.0; 6]));
}

/// The reader takes a typed array over the arriving bytes rather than copying them, which
/// a block landing off a four-byte boundary would make illegal.
#[test]
fn every_block_starts_on_a_four_byte_boundary() {
    let mut map = one_mesh(5, &["a", "bb", "ccc"]);
    map.uv1 = Some(vec![1.0; 10]);

    let (_, offsets) = decode(&map.encode().unwrap());

    for offset in offsets {
        assert_eq!(offset % 4, 0, "a block starts at {offset}");
    }
}

/// A ragged string table is why the strings are last, so a material of a length that is
/// no multiple of four must not move anything.
#[test]
fn a_material_of_an_awkward_length_misaligns_nothing() {
    let (_, offsets) = decode(&one_mesh(2, &["five", "seven77", "a"]).encode().unwrap());

    for offset in offsets {
        assert_eq!(offset % 4, 0, "a block starts at {offset}");
    }
}

#[test]
fn a_material_named_twice_is_written_once_and_indexed_twice() {
    let (decoded, _) = decode(
        &one_mesh(3, &["shared", "other", "shared"])
            .encode()
            .unwrap(),
    );

    assert_eq!(decoded.materials, vec!["shared", "other"]);
    assert_eq!(
        decoded.submeshes.iter().map(|s| s.2).collect::<Vec<_>>(),
        vec![0, 1, 0],
        "the third submesh points back at the first material"
    );
}

#[test]
fn a_mesh_record_carries_its_bounds_and_the_fields_a_viewport_filters_on() {
    let (decoded, _) = decode(&one_mesh(3, &["a", "b"]).encode().unwrap());

    assert_eq!(
        decoded.meshes,
        vec![DecodedMesh {
            min: [-1.0, -2.0, -3.0],
            max: [4.0, 5.0, 6.0],
            visibility: 0b1000_0001,
            quality: 0x1f,
            flags: MESH_CULL_DISABLED,
            first_submesh: 0,
            submesh_count: 2,
        }]
    );
}

#[test]
fn the_blocks_round_trip_by_value() {
    let map = one_mesh(4, &["a"]);
    let (positions, normals, uv0) = (map.positions.clone(), map.normals.clone(), map.uv0.clone());

    let (decoded, _) = decode(&map.encode().unwrap());

    assert_eq!(decoded.positions, positions);
    assert_eq!(decoded.normals, normals);
    assert_eq!(decoded.uv0, uv0);
    assert_eq!(decoded.indices, vec![0, 1, 2, 3]);
}

#[test]
fn a_map_of_no_meshes_still_writes_a_header_and_an_empty_string_table() {
    let map = Map {
        positions: Vec::new(),
        normals: Vec::new(),
        uv0: Vec::new(),
        uv1: None,
        indices: Vec::new(),
        meshes: Vec::new(),
        submeshes: Vec::new(),
        lights: Vec::new(),
        materials: IndexSet::new(),
        lightmaps: IndexSet::new(),
    };

    let (decoded, _) = decode(&map.encode().unwrap());

    assert!(decoded.meshes.is_empty());
    assert!(decoded.materials.is_empty());
}

#[test]
fn a_normal_is_written_as_a_unit_vector() {
    assert_eq!(unit(vec3(0.0, 0.0, 5.0)), vec3(0.0, 0.0, 1.0));
}

/// A singular transform's inverse transpose turns a normal into zeroes or infinities, and
/// a map of one bad mesh still draws.
#[test]
fn a_normal_with_no_direction_takes_the_default() {
    assert_eq!(unit(Vec3::ZERO), DEFAULT_NORMAL);
    assert_eq!(unit(Vec3::splat(f32::NAN)), DEFAULT_NORMAL);
    assert_eq!(unit(vec3(f32::INFINITY, 0.0, 0.0)), DEFAULT_NORMAL);
}

/// The second UV set is the lightmap channel, which no shipped file puts on `Texcoord1`.
#[test]
fn the_second_uv_set_is_texcoord7() {
    assert_eq!(UV1_ELEMENT, ElementName::Texcoord7);
}

/// The bake, against a shipped map rather than a fixture.
///
/// Ignored because it reads a game install. Point it at one and run it by name:
///
/// ```text
/// LTK_LIVE_MAPGEO='<wad path>#<chunk hash in hex>' ///   cargo test -p ltk-manager-core the_bake -- --ignored --nocapture
/// ```
///
/// The file's own bounding box is what says whether the transform was read the right way
/// round: getting it wrong misplaces the meshes that carry one by thousands of units, and
/// only their own bounds catch it. A region-anchored mesh is excluded, because the file
/// states its box in the region's space rather than the world's.
#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_MAPGEO"]
fn the_bake_agrees_with_the_bounds_a_shipped_map_states() {
    let Ok(target) = std::env::var("LTK_LIVE_MAPGEO") else {
        panic!("set LTK_LIVE_MAPGEO to '<wad path>#<chunk hash in hex>'");
    };
    let (path, hash) = target
        .rsplit_once('#')
        .expect("a target names a chunk with #");
    let hash = u64::from_str_radix(hash, 16).expect("a chunk hash is hex");

    let mut wad = ltk_wad::Wad::mount(fs_err::File::open(path).unwrap()).unwrap();
    let chunk = *wad.chunks().get(ltk_hash::WadHash(hash)).unwrap();
    let bytes = wad.load_chunk_decompressed(&chunk).unwrap();

    let asset = EnvironmentAsset::from_reader(&mut Cursor::new(&bytes)).unwrap();
    let buffer = render(&bytes).expect("a shipped map encodes");
    let (decoded, offsets) = decode(&buffer);

    for offset in offsets {
        assert_eq!(offset % 4, 0, "a block starts at {offset}");
    }
    assert_eq!(decoded.meshes.len(), asset.mesh_count());

    let vertices = decoded.positions.len() / 3;
    println!(
        "{} MiB  meshes {}  submeshes {}  materials {}  vertices {vertices}  indices {}  uv1 {}",
        buffer.len() / (1024 * 1024),
        decoded.meshes.len(),
        decoded.submeshes.len(),
        decoded.materials.len(),
        decoded.indices.len(),
        decoded.uv1.is_some(),
    );

    /* The file's bounds are conservative, so a computed bound sits inside them and the
    tolerance covers float error alone rather than any slack in the file. */
    const TOLERANCE: f32 = 1.0;
    let mut against_the_file = 0usize;
    let mut region_anchored = 0usize;
    let mut worst = 0.0f32;

    for (mesh, source) in decoded.meshes.iter().zip(asset.meshes()) {
        let (min, max) = (mesh.min, mesh.max);
        let first = mesh.first_submesh as usize;

        for submesh in &decoded.submeshes[first..first + mesh.submesh_count as usize] {
            let range = submesh.0 as usize..(submesh.0 + submesh.1) as usize;
            for index in &decoded.indices[range] {
                let at = *index as usize;
                assert!(at < vertices, "an index names vertex {at} of {vertices}");
                for axis in 0..3 {
                    let value = decoded.positions[at * 3 + axis];
                    assert!(
                        value >= min[axis] - TOLERANCE && value <= max[axis] + TOLERANCE,
                        "a vertex of mesh {} sits outside the bound written beside it",
                        source.name()
                    );
                }
            }
        }

        if mesh.flags & MESH_REGION_ANCHORED != 0 {
            region_anchored += 1;
            continue;
        }
        let stated = source.bounding_box();
        let (lo, hi) = (
            [stated.min.x, stated.min.y, stated.min.z],
            [stated.max.x, stated.max.y, stated.max.z],
        );
        for axis in 0..3 {
            let over = (lo[axis] - min[axis]).max(max[axis] - hi[axis]);
            worst = worst.max(over);
            assert!(
                over <= TOLERANCE,
                "mesh {} baked {over} units outside the bounds the file states",
                source.name()
            );
        }
        against_the_file += 1;
    }

    println!(
        "{against_the_file} meshes agree with the bounds the file states, worst overshoot {worst} units"
    );
    println!("{region_anchored} region-anchored meshes were not checked against the file");
}
