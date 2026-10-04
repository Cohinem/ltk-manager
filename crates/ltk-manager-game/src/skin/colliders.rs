//! The colliders a dynamics chain reads from the file it names, written into the layer of
//! the skin that names it.
//!
//! "The colliders" in docs/plans/pose-dynamics-preview.md. The layout is the one the
//! game's loader reads, since no file of the kind ships.

use std::path::{Component, Path};

use fs_err as fs;
use serde::{Deserialize, Serialize};

use ltk_manager_base::error::{AppError, AppResult};

/// A sphere on one joint, its centre in the bind pose's model space.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ColliderSphere {
    /// The name of the joint the sphere rides.
    pub joint: String,
    /// The centre.
    pub centre: [f32; 3],
    /// The radius.
    pub radius: f32,
}

/// A capsule between two joints, each end in the bind pose's model space with its own radius.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ColliderCapsule {
    /// The name of the joint the first end rides.
    pub joint_a: String,
    /// The first end.
    pub end_a: [f32; 3],
    /// The radius at the first end.
    pub radius_a: f32,
    /// The name of the joint the second end rides.
    pub joint_b: String,
    /// The second end.
    pub end_b: [f32; 3],
    /// The radius at the second end.
    pub radius_b: f32,
}

/// The shapes of one collider file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ColliderShapes {
    /// The spheres, in file order.
    pub spheres: Vec<ColliderSphere>,
    /// The capsules, in file order.
    pub capsules: Vec<ColliderCapsule>,
}

/// `shapes` as the bytes of a collider file.
///
/// Little-endian: two words the game's loader reads and does not use, a count of spheres,
/// each a named joint with a centre and a radius, then a count of capsules, each two of
/// those.
fn collider_bytes(shapes: &ColliderShapes) -> AppResult<Vec<u8>> {
    let mut out = Vec::new();
    out.extend_from_slice(&[0; 8]);

    write_count(&mut out, shapes.spheres.len())?;
    for sphere in &shapes.spheres {
        write_end(&mut out, &sphere.joint, sphere.centre, sphere.radius)?;
    }

    write_count(&mut out, shapes.capsules.len())?;
    for capsule in &shapes.capsules {
        write_end(&mut out, &capsule.joint_a, capsule.end_a, capsule.radius_a)?;
        write_end(&mut out, &capsule.joint_b, capsule.end_b, capsule.radius_b)?;
    }

    Ok(out)
}

fn write_count(out: &mut Vec<u8>, count: usize) -> AppResult<()> {
    let count = u32::try_from(count)
        .map_err(|_| AppError::ValidationFailed("A collider file counts in 32 bits".to_owned()))?;
    out.extend_from_slice(&count.to_le_bytes());

    Ok(())
}

fn write_end(out: &mut Vec<u8>, joint: &str, point: [f32; 3], radius: f32) -> AppResult<()> {
    write_count(out, joint.len())?;
    out.extend_from_slice(joint.as_bytes());
    for value in point.into_iter().chain([radius]) {
        out.extend_from_slice(&value.to_le_bytes());
    }

    Ok(())
}

/// `shapes` saved as the file at the game path `path`, in `archive` of the project's `layer`.
///
/// Answers the saved file's path under the layer. The file is written under the lowercase
/// of `path`, which is the spelling the game hashes.
///
/// # Errors
///
/// Fails for a path that is empty, absolute or climbs out of its archive, and for a failed
/// write.
pub fn save_colliders(
    project: &Path,
    layer: &str,
    archive: &str,
    path: &str,
    shapes: &ColliderShapes,
) -> AppResult<String> {
    let inner = path.replace('\\', "/").to_ascii_lowercase();
    let plain = !inner.is_empty()
        && Path::new(&inner)
            .components()
            .all(|part| matches!(part, Component::Normal(_)));
    if !plain {
        return Err(AppError::InvalidPath(format!(
            "Not a path inside an archive: {path}"
        )));
    }

    let bytes = collider_bytes(shapes)?;
    let folder = project.join("content").join(layer).join(archive);
    let file = folder.join(&inner);
    let parent = file.parent().unwrap_or(&folder);
    fs::create_dir_all(parent)?;

    /* A name of its own, so two saves of one file never share a temporary file. */
    let temporary = tempfile::NamedTempFile::new_in(parent)?;
    fs::write(temporary.path(), bytes)?;
    temporary.persist(&file).map_err(|error| error.error)?;

    Ok(format!("{archive}/{inner}"))
}

#[cfg(test)]
mod tests;
