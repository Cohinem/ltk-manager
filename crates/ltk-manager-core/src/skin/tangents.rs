use std::io::Cursor;

use fs_err as fs;
use ltk_mesh::SkinnedMesh;

use crate::error::{AppError, AppResult};
use crate::preview::{AssetRef, PreviewError};

/// Tangents baked into a skin's mesh in the same project layer.
///
/// # Errors
/// Fails for assets outside the skin's layer, invalid geometry, or a failed file write.
pub fn bake_mesh_tangents(skin: &AssetRef, mesh: &AssetRef) -> AppResult<()> {
    match (skin, mesh) {
        (
            AssetRef::Layer { project, layer, .. },
            AssetRef::Layer {
                project: mesh_project,
                layer: mesh_layer,
                ..
            },
        ) if project == mesh_project && layer == mesh_layer => {}
        _ => {
            return Err(AppError::ValidationFailed(
                "The mesh must be in the skin's project layer".to_owned(),
            ));
        }
    }

    let path = mesh
        .layer_file()
        .expect("a checked layer mesh has a file")?;
    let original = fs::read(&path)?;
    let mut mesh =
        SkinnedMesh::from_reader(&mut Cursor::new(&original)).map_err(PreviewError::from)?;
    mesh.bake_tangents().map_err(PreviewError::from)?;

    let mut bytes = Vec::new();
    mesh.to_writer(&mut bytes).map_err(PreviewError::from)?;

    let parent = path.parent().expect("a layer file has a parent directory");
    let temporary = tempfile::NamedTempFile::new_in(parent)?;
    fs::write(temporary.path(), bytes)?;
    temporary.persist(&path).map_err(|error| error.error)?;

    Ok(())
}

#[cfg(test)]
mod tests;
