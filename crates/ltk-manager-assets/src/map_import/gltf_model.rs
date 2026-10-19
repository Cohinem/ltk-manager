//! Reads a glTF 2.0 file, `.gltf` with embedded or external buffers, or `.glb`.

use std::path::Path;

use glam::{Mat3, Mat4, Vec2, Vec3};
use gltf::image::Format;
use gltf::material::AlphaMode;
use gltf::mesh::Mode;
use image::{GrayAlphaImage, GrayImage, RgbImage, RgbaImage};

use fs_err as fs;

use super::{
    EXPORTED_KEY, ExportedMesh, ImportError, ModelFile, SkippedItems, SkippedKind, SourceMaterial,
    SourceMesh, SourcePart, TextureSource, UpAxis,
};

/// Returns the [`ExportedMesh`] in the extras of `mesh`. Returns `None` if the extras have no
/// valid one.
fn exported_of(mesh: &gltf::Mesh<'_>) -> Option<ExportedMesh> {
    let extras: serde_json::Value = serde_json::from_str(mesh.extras().as_ref()?.get()).ok()?;
    serde_json::from_value(extras.get(EXPORTED_KEY)?.clone()).ok()
}

/// A parsed glTF document and the bytes of its buffers.
struct Opened {
    gltf: gltf::Gltf,
    buffers: Vec<gltf::buffer::Data>,
}

fn open(path: &Path) -> Result<Opened, ImportError> {
    let bytes = fs::read(path)?;
    let gltf = gltf::Gltf::from_slice(&bytes)?;
    let buffers = gltf::import_buffers(&gltf.document, path.parent(), gltf.blob.clone())?;
    Ok(Opened { gltf, buffers })
}

/// Counts of what the reader skipped.
#[derive(Default)]
struct Skipped {
    blend_shapes: u32,
    lines: u32,
}

/// Reads the meshes of the default scene of the glTF file at `path`. glTF is Y up and
/// states no unit, so the scale is 1.
pub(super) fn read(path: &Path) -> Result<ModelFile, ImportError> {
    let Opened { gltf, buffers } = open(path)?;
    let document = &gltf.document;
    let base = path.parent().unwrap_or(Path::new(""));

    let mut materials: Vec<SourceMaterial> = document
        .materials()
        .map(|material| source_material(&material, base))
        .collect();
    let fallback = materials.len();

    let mut meshes = Vec::new();
    let mut skipped = Skipped::default();
    let scene = document
        .default_scene()
        .or_else(|| document.scenes().next());
    for node in scene.iter().flat_map(gltf::Scene::nodes) {
        read_node(
            &node,
            Mat4::IDENTITY,
            &buffers,
            fallback,
            &mut meshes,
            &mut skipped,
        );
    }

    let uses_fallback = meshes
        .iter()
        .flat_map(|mesh: &SourceMesh| &mesh.parts)
        .any(|part| part.material == fallback);
    if uses_fallback {
        materials.push(SourceMaterial {
            name: "Default".to_owned(),
            texture: None,
            alpha: false,
        });
    }

    let counts = [
        (SkippedKind::Skin, document.skins().count() as u32),
        (SkippedKind::BlendShape, skipped.blend_shapes),
        (SkippedKind::Camera, document.cameras().count() as u32),
        (SkippedKind::Animation, document.animations().count() as u32),
        (SkippedKind::Line, skipped.lines),
    ];
    Ok(ModelFile {
        meshes,
        materials,
        scale: 1.0,
        up: UpAxis::Y,
        skipped: counts
            .into_iter()
            .filter(|&(_, count)| count > 0)
            .map(|(kind, count)| SkippedItems { kind, count })
            .collect(),
    })
}

fn source_material(material: &gltf::Material<'_>, base: &Path) -> SourceMaterial {
    let index = material.index().unwrap_or_default();
    let texture = material
        .pbr_metallic_roughness()
        .base_color_texture()
        .map(|info| match info.texture().source().source() {
            gltf::image::Source::Uri { uri, .. } if !uri.starts_with("data:") => {
                // shortcut: decodes only `%20`, switch to a percent decoder if a file needs more.
                TextureSource::File(base.join(uri.replace("%20", " ")))
            }
            _ => TextureSource::Embedded,
        });

    SourceMaterial {
        name: material
            .name()
            .map_or_else(|| format!("Material{index}"), str::to_owned),
        texture,
        alpha: material.alpha_mode() != AlphaMode::Opaque,
    }
}

/// Reads the mesh of `node` and of every node under it, with `parent` as the transform above.
fn read_node(
    node: &gltf::Node<'_>,
    parent: Mat4,
    buffers: &[gltf::buffer::Data],
    fallback: usize,
    meshes: &mut Vec<SourceMesh>,
    skipped: &mut Skipped,
) {
    let world = parent * Mat4::from_cols_array_2d(&node.transform().matrix());
    if let Some(mesh) = node.mesh() {
        let name = node
            .name()
            .or(mesh.name())
            .map_or_else(|| format!("Mesh{}", mesh.index()), str::to_owned);
        let source = read_mesh(&mesh, name, world, buffers, fallback, skipped);
        if !source.parts.is_empty() {
            meshes.push(source);
        }
    }
    for child in node.children() {
        read_node(&child, world, buffers, fallback, meshes, skipped);
    }
}

fn read_mesh(
    mesh: &gltf::Mesh<'_>,
    name: String,
    world: Mat4,
    buffers: &[gltf::buffer::Data],
    fallback: usize,
    skipped: &mut Skipped,
) -> SourceMesh {
    let normal_matrix = Mat3::from_mat4(world).inverse().transpose();
    let mirrored = world.determinant() < 0.0;
    let mut out = SourceMesh {
        name,
        exported: exported_of(mesh),
        ..SourceMesh::default()
    };
    if mesh
        .primitives()
        .any(|primitive| primitive.morph_targets().next().is_some())
    {
        skipped.blend_shapes += 1;
    }

    for primitive in mesh.primitives() {
        let mode = primitive.mode();
        if !matches!(
            mode,
            Mode::Triangles | Mode::TriangleStrip | Mode::TriangleFan
        ) {
            skipped.lines += 1;
            continue;
        }

        let reader = primitive.reader(|buffer| buffers.get(buffer.index()).map(|data| &data.0[..]));
        let Some(positions) = reader.read_positions() else {
            continue;
        };
        let start = out.positions.len();
        out.positions
            .extend(positions.map(|p| world.transform_point3(Vec3::from(p))));
        let count = out.positions.len() - start;

        let normals = reader
            .read_normals()
            .map(|normals| normals.map(|n| normal_matrix * Vec3::from(n)).collect());
        fill(&mut out.normals, normals, start, count, Vec3::ZERO);
        let uv0 = reader
            .read_tex_coords(0)
            .map(|uv| uv.into_f32().map(Vec2::from).collect());
        fill(&mut out.uv0, uv0, start, count, Vec2::ZERO);
        let uv1 = reader
            .read_tex_coords(1)
            .map(|uv| uv.into_f32().map(Vec2::from).collect());
        fill(&mut out.uv1, uv1, start, count, Vec2::ZERO);
        let colors = reader
            .read_colors(0)
            .map(|colors| colors.into_rgba_u8().collect());
        fill(&mut out.colors, colors, start, count, [255; 4]);

        let listed: Vec<u32> = match reader.read_indices() {
            Some(indices) => indices.into_u32().collect(),
            None => (0..count as u32).collect(),
        };
        let mut indices = triangle_list(mode, &listed);
        if mirrored {
            for triangle in indices.as_chunks_mut::<3>().0 {
                triangle.swap(1, 2);
            }
        }

        let material = primitive.material().index().unwrap_or(fallback);
        let shifted = indices.into_iter().map(|index| index + start as u32);
        match out.parts.iter_mut().find(|part| part.material == material) {
            Some(part) => part.indices.extend(shifted),
            None => out.parts.push(SourcePart {
                material,
                indices: shifted.collect(),
            }),
        }
    }
    out
}

/// Appends `values` to `slot`, or `count` copies of `default` where the primitive has none.
/// The first primitive that has values fills the vertices before it with `default` too.
fn fill<T: Clone>(
    slot: &mut Option<Vec<T>>,
    values: Option<Vec<T>>,
    start: usize,
    count: usize,
    default: T,
) {
    match (slot.as_mut(), values) {
        (Some(held), Some(values)) => held.extend(values),
        (Some(held), None) => held.extend(std::iter::repeat_n(default, count)),
        (None, Some(values)) => {
            let mut held = vec![default; start];
            held.extend(values);
            *slot = Some(held);
        }
        (None, None) => {}
    }
}

/// Returns the indices of `mode` as a triangle list.
fn triangle_list(mode: Mode, indices: &[u32]) -> Vec<u32> {
    match mode {
        Mode::TriangleStrip => (0..indices.len().saturating_sub(2))
            .flat_map(|at| match at % 2 {
                0 => [indices[at], indices[at + 1], indices[at + 2]],
                _ => [indices[at + 1], indices[at], indices[at + 2]],
            })
            .collect(),
        Mode::TriangleFan => (1..indices.len().saturating_sub(1))
            .flat_map(|at| [indices[0], indices[at], indices[at + 1]])
            .collect(),
        _ => indices[..indices.len() / 3 * 3].to_vec(),
    }
}

/// Reads the embedded base color texture of material `material` of the glTF file at `path`.
pub(super) fn read_embedded_texture(
    path: &Path,
    material: usize,
) -> Result<RgbaImage, ImportError> {
    let Opened { gltf, buffers } = open(path)?;
    let source = gltf
        .document
        .materials()
        .nth(material)
        .and_then(|material| material.pbr_metallic_roughness().base_color_texture())
        .map(|info| info.texture().source().source())
        .ok_or(ImportError::TextureFormat(material))?;
    let data = gltf::image::Data::from_source(source, path.parent(), &buffers)?;

    let (width, height, pixels) = (data.width, data.height, data.pixels);
    let rgba = match data.format {
        Format::R8G8B8A8 => RgbaImage::from_raw(width, height, pixels),
        Format::R8G8B8 => RgbImage::from_raw(width, height, pixels)
            .map(|image| image::DynamicImage::ImageRgb8(image).to_rgba8()),
        Format::R8G8 => GrayAlphaImage::from_raw(width, height, pixels)
            .map(|image| image::DynamicImage::ImageLumaA8(image).to_rgba8()),
        Format::R8 => GrayImage::from_raw(width, height, pixels)
            .map(|image| image::DynamicImage::ImageLuma8(image).to_rgba8()),
        _ => None,
    };
    rgba.ok_or(ImportError::TextureFormat(material))
}
