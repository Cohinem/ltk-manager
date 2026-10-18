//! Reads an FBX file, binary or ASCII, or an OBJ file with the `.mtl` beside it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use glam::{Vec2, Vec3};
use image::RgbaImage;

use super::{
    ImportError, ModelFile, SkippedItems, SkippedKind, SourceMaterial, SourceMesh, SourcePart,
    TextureSource, UpAxis,
};

fn load(path: &Path) -> Result<ufbx::SceneRoot, ImportError> {
    let file = path
        .to_str()
        .ok_or_else(|| ImportError::Ufbx(format!("{} is not a UTF-8 path", path.display())))?;
    let options = ufbx::LoadOpts {
        load_external_files: true,
        ignore_missing_external_files: true,
        ..Default::default()
    };
    ufbx::load_file(file, options).map_err(|error| ImportError::Ufbx(error.description.to_string()))
}

/// Reads the meshes of every node of the FBX or OBJ file at `path`, in the file's own axes.
/// An FBX file states its unit and up axis, and an OBJ file is read as Y up with a scale of 1.
pub(super) fn read(path: &Path) -> Result<ModelFile, ImportError> {
    let scene = load(path)?;
    let base = path.parent().unwrap_or(Path::new(""));

    let mut materials: Vec<SourceMaterial> = scene
        .materials
        .iter()
        .map(|material| source_material(material, base))
        .collect();
    let fallback = materials.len();

    let mut meshes = Vec::new();
    let mut lines = 0;
    for node in scene.nodes.iter() {
        let Some(mesh) = node.mesh.as_ref() else {
            continue;
        };
        if mesh.num_line_faces + mesh.num_point_faces > 0 {
            lines += 1;
        }
        let source = read_mesh(node, mesh, fallback);
        if !source.parts.is_empty() {
            meshes.push(source);
        }
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

    let (scale, up) = match scene.metadata.file_format {
        ufbx::FileFormat::Fbx => {
            let meters = scene.settings.unit_meters;
            let scale = if meters > 0.0 {
                (meters * 100.0) as f32
            } else {
                1.0
            };
            let up = match scene.settings.axes.up {
                ufbx::CoordinateAxis::PositiveZ | ufbx::CoordinateAxis::NegativeZ => UpAxis::Z,
                _ => UpAxis::Y,
            };
            (scale, up)
        }
        _ => (1.0, UpAxis::Y),
    };

    let animations = if scene.anim_curves.is_empty() {
        0
    } else {
        scene.anim_stacks.len().max(1)
    };
    let counts = [
        (SkippedKind::Skin, scene.skin_deformers.len()),
        (SkippedKind::BlendShape, scene.blend_deformers.len()),
        (SkippedKind::Camera, scene.cameras.len()),
        (SkippedKind::Light, scene.lights.len()),
        (SkippedKind::Animation, animations),
        (SkippedKind::Line, lines),
    ];
    Ok(ModelFile {
        meshes,
        materials,
        scale,
        up,
        skipped: counts
            .into_iter()
            .filter(|&(_, count)| count > 0)
            .map(|(kind, count)| SkippedItems {
                kind,
                count: count as u32,
            })
            .collect(),
    })
}

fn base_color(material: &ufbx::Material) -> Option<&ufbx::Texture> {
    material
        .pbr
        .base_color
        .texture
        .as_deref()
        .or(material.fbx.diffuse_color.texture.as_deref())
}

fn source_material(material: &ufbx::Material, base: &Path) -> SourceMaterial {
    let texture = base_color(material).map(|texture| {
        if texture.content.is_empty() {
            TextureSource::File(texture_file(texture, base))
        } else {
            TextureSource::Embedded
        }
    });
    let opacity = &material.pbr.opacity;

    SourceMaterial {
        name: material.element.name.to_string(),
        texture,
        alpha: opacity.texture.is_some() || (opacity.has_value && opacity.value_vec4.x < 1.0),
    }
}

/// The file of `texture`: its absolute path, else its relative path or its file name beside
/// the model, else the path it names.
fn texture_file(texture: &ufbx::Texture, base: &Path) -> PathBuf {
    let named = PathBuf::from(texture.filename.as_ref());
    let candidates = [
        PathBuf::from(texture.absolute_filename.as_ref()),
        base.join(texture.relative_filename.as_ref()),
        base.join(named.file_name().unwrap_or_default()),
    ];
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .unwrap_or(named)
}

fn read_mesh(node: &ufbx::Node, mesh: &ufbx::Mesh, fallback: usize) -> SourceMesh {
    let world = &node.geometry_to_world;
    let normal_matrix = ufbx::matrix_for_normals(world);
    let mirrored = determinant(world) < 0.0;

    let has_normals = mesh.vertex_normal.exists;
    let has_uv0 = mesh.vertex_uv.exists;
    let uv1 = mesh.uv_sets.get(1).map(|set| &set.vertex_uv);
    let has_colors = mesh.vertex_color.exists;

    let mut out = SourceMesh {
        name: node.element.name.to_string(),
        normals: has_normals.then(Vec::new),
        uv0: has_uv0.then(Vec::new),
        uv1: uv1.map(|_| Vec::new()),
        colors: has_colors.then(Vec::new),
        ..SourceMesh::default()
    };

    /* One vertex per distinct set of attribute indices, which shares the corners that agree. */
    let mut vertices: HashMap<[u32; 5], u32> = HashMap::new();
    let mut corner_vertex = |out: &mut SourceMesh, corner: usize| -> u32 {
        let index_of = |exists: bool, indices: &[u32]| if exists { indices[corner] } else { 0 };
        let key = [
            mesh.vertex_position.indices[corner],
            index_of(has_normals, &mesh.vertex_normal.indices),
            index_of(has_uv0, &mesh.vertex_uv.indices),
            uv1.map_or(0, |uv| uv.indices[corner]),
            index_of(has_colors, &mesh.vertex_color.indices),
        ];
        *vertices.entry(key).or_insert_with(|| {
            let at = out.positions.len() as u32;
            let p = ufbx::transform_position(world, mesh.vertex_position[corner]);
            out.positions.push(vec3(p));
            if let Some(normals) = &mut out.normals {
                let n = ufbx::transform_direction(&normal_matrix, mesh.vertex_normal[corner]);
                normals.push(vec3(n));
            }
            /* FBX and OBJ put the UV origin at the bottom, and the engine at the top. */
            if let Some(uv0) = &mut out.uv0 {
                uv0.push(flipped(mesh.vertex_uv[corner]));
            }
            if let (Some(held), Some(source)) = (&mut out.uv1, uv1) {
                held.push(flipped(source[corner]));
            }
            if let Some(colors) = &mut out.colors {
                let c = mesh.vertex_color[corner];
                colors.push(
                    [c.x, c.y, c.z, c.w]
                        .map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8),
                );
            }
            at
        })
    };

    let materials = |slot: u32| -> usize {
        node.materials
            .get(slot as usize)
            .or(mesh.materials.get(slot as usize))
            .map_or(fallback, |material| material.element.typed_id as usize)
    };

    let mut triangles = vec![0u32; mesh.max_face_triangles * 3];
    for (face_index, face) in mesh.faces.iter().enumerate() {
        let count = mesh.triangulate_face(&mut triangles, *face) as usize;
        if count == 0 {
            continue;
        }
        let material = mesh
            .face_material
            .get(face_index)
            .map_or(fallback, |&slot| materials(slot));

        let mut indices = Vec::with_capacity(count * 3);
        for triangle in triangles[..count * 3].as_chunks::<3>().0 {
            let [a, b, c] = [0, 1, 2].map(|at| corner_vertex(&mut out, triangle[at] as usize));
            if mirrored {
                indices.extend([a, c, b]);
            } else {
                indices.extend([a, b, c]);
            }
        }

        match out.parts.iter_mut().find(|part| part.material == material) {
            Some(part) => part.indices.extend(indices),
            None => out.parts.push(SourcePart { material, indices }),
        }
    }
    out
}

fn vec3(v: ufbx::Vec3) -> Vec3 {
    Vec3::new(v.x as f32, v.y as f32, v.z as f32)
}

fn flipped(uv: ufbx::Vec2) -> Vec2 {
    Vec2::new(uv.x as f32, 1.0 - uv.y as f32)
}

fn determinant(m: &ufbx::Matrix) -> f64 {
    m.m00 * (m.m11 * m.m22 - m.m12 * m.m21) - m.m01 * (m.m10 * m.m22 - m.m12 * m.m20)
        + m.m02 * (m.m10 * m.m21 - m.m11 * m.m20)
}

/// Reads the embedded base color texture of material `material` of the file at `path`.
pub(super) fn read_embedded_texture(
    path: &Path,
    material: usize,
) -> Result<RgbaImage, ImportError> {
    let scene = load(path)?;
    let texture = scene
        .materials
        .get(material)
        .and_then(|material| base_color(material))
        .ok_or(ImportError::TextureFormat(material))?;
    Ok(image::load_from_memory(&texture.content)?.to_rgba8())
}
