//! The map editor's mesh import: what a model file holds, and the materials and textures that
//! an import creates. The meshes land through `map_geometry_edit`. "Adding meshes" in
//! docs/ux/MAP_EDITOR.md.

use std::path::Path;

use ltk_manager_assets::map_import::{
    encode_texture, read_image, read_model, read_texture, ModelSummary,
};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::utils::fs::atomic_write;
use ltk_manager_bin::bin_document::{BinDocumentId, BinDocuments, NewObject, ObjectCreation};
use ltk_manager_bin::sandbox::SandboxState;
use ltk_manager_game::material::template::{material_text, MaterialTemplate};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use fs_err as fs;

use crate::error::IpcResult;
use crate::services::shared::{off_thread, WriteTarget};

/// A `StaticMaterialDef` that an import creates for one material of a model file.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImport {
    /// The entry path, which is also the material's `name`.
    pub name: String,
    pub template: MaterialTemplate,
    /// The model file.
    pub model: String,
    /// The material of the model file, by index.
    pub material: u32,
    /// An image file that replaces the texture of the model's material.
    pub texture: Option<String>,
}

/// Lists the meshes, materials and textures of the model file at `path`.
#[tauri::command]
#[specta::specta]
pub async fn map_import_inspect(path: String) -> IpcResult<ModelSummary> {
    off_thread(move || Ok(read_model(Path::new(&path))?.summary())).await
}

/// Converts the texture of each of `created` to a `.tex` under `assets/<map>/` in the layer
/// that the open bin `materials` writes to, and returns the objects that create the materials.
///
/// A material without a texture, or whose texture file does not exist, draws the template
/// shader's default texture.
///
/// # Errors
///
/// Fails if `materials` writes to no layer, or a model or texture cannot be read or written.
#[tauri::command]
#[specta::specta]
pub async fn map_import_materials(
    materials: BinDocumentId,
    map: String,
    created: Vec<MaterialImport>,
    app_handle: AppHandle,
) -> IpcResult<Vec<ObjectCreation>> {
    off_thread(move || {
        let write = WriteTarget::of(&app_handle.state::<BinDocuments>(), materials)?;
        let archive = write.archive()?;
        let folder = format!("assets/{}", map.to_lowercase());

        let mut objects = Vec::with_capacity(created.len());
        for each in created {
            let image = match &each.texture {
                Some(file) => Some(read_image(Path::new(file))?),
                None => read_texture(Path::new(&each.model), each.material as usize)?,
            };
            let texture = match image {
                None => each.template.default_texture().to_owned(),
                Some(image) => {
                    let path = format!("{folder}/{}.tex", file_stem(&each.name));
                    let bytes =
                        encode_texture(&image, each.template == MaterialTemplate::FlatAlphaTest)?;
                    let target = AssetRef::Layer {
                        project: write.project.clone(),
                        layer: write.layer.clone(),
                        path: format!("{archive}/{path}"),
                    }
                    .layer_file()
                    .expect("a layer asset names a layer file")?;
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    atomic_write(&target, &bytes)?;
                    path
                }
            };

            objects.push(ObjectCreation {
                origin: NewObject::Paste {
                    text: material_text(&each.name, each.template, &texture),
                },
                name: each.name,
            });
        }

        app_handle
            .state::<SandboxState>()
            .invalidate(&write.project);
        Ok(objects)
    })
    .await
}

/// The last segment of the entry path `name`, lowercased, with every character outside
/// `a-z`, `0-9`, `_` and `-` replaced by `_`. Returns `texture` for an empty name.
fn file_stem(name: &str) -> String {
    let last = name.rsplit('/').next().unwrap_or(name);
    let stem: String = last
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'a'..='z' | '0'..='9' | '_' | '-' => c,
            _ => '_',
        })
        .collect();
    if stem.is_empty() {
        return "texture".to_owned();
    }
    stem
}
