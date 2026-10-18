//! The map editor's open `.mapgeo` files: their meshes, edits, undo and save. "Meshes" and
//! "Saving geometry" in docs/ux/MAP_EDITOR.md.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use fs_err as fs;
use ltk_manager_assets::game_wads::WadCache;
use ltk_manager_assets::map_geometry::{
    MapGeometryDocument, MapGeometryEdit, MapGeometryMesh, MeshDelta,
};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::utils::fs::atomic_write;
use ltk_manager_bin::bin_document::{BinDocumentId, BinDocuments};
use ltk_manager_bin::sandbox::SandboxState;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult, IpcResult};
use crate::services::shared::{archive_of, off_thread, WriteTarget};
use crate::state::SettingsState;

/// The id of an open `.mapgeo`. Ids are never reused.
pub type MapGeometryId = u32;

/// One open `.mapgeo` and the asset it was read from.
struct OpenGeometry {
    document: MapGeometryDocument,
    asset: AssetRef,
}

/// Every open `.mapgeo`, by id.
#[derive(Default)]
pub struct MapGeometryDocuments {
    open: Mutex<HashMap<MapGeometryId, Arc<Mutex<OpenGeometry>>>>,
    next: AtomicU32,
}

impl MapGeometryDocuments {
    fn get(&self, id: MapGeometryId) -> AppResult<Arc<Mutex<OpenGeometry>>> {
        self.open
            .lock()
            .get(&id)
            .cloned()
            .ok_or_else(|| AppError::ValidationFailed(format!("No map geometry is open as {id}")))
    }

    /// Encodes the open `.mapgeo` under `id` as the buffer a viewport draws.
    ///
    /// # Errors
    ///
    /// Fails if no `.mapgeo` is open under `id` or the buffer cannot be built.
    pub fn preview(&self, id: MapGeometryId) -> AppResult<Vec<u8>> {
        Ok(self.get(id)?.lock().document.preview()?)
    }

    /// Encodes the meshes at `meshes` of the open `.mapgeo` under `id`, in that order.
    ///
    /// # Errors
    ///
    /// Fails if no `.mapgeo` is open under `id` or the buffer cannot be built.
    pub fn preview_meshes(&self, id: MapGeometryId, meshes: &[usize]) -> AppResult<Vec<u8>> {
        Ok(self.get(id)?.lock().document.preview_meshes(meshes)?)
    }
}

/// Where an open `.mapgeo` stands after a change.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MapGeometryState {
    pub id: MapGeometryId,
    /// Counts every change.
    pub revision: u64,
    /// The document holds changes that no save wrote.
    pub dirty: bool,
}

/// An open `.mapgeo` after a change, and what the change did to the meshes a viewport draws.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MapGeometryChange {
    pub state: MapGeometryState,
    pub deltas: Vec<MeshDelta>,
}

fn state_of(id: MapGeometryId, open: &OpenGeometry) -> MapGeometryState {
    MapGeometryState {
        id,
        revision: open.document.revision(),
        dirty: open.document.is_dirty(),
    }
}

/// Opens `asset` as a `.mapgeo` that takes edits.
#[tauri::command]
#[specta::specta]
pub async fn map_geometry_open(
    asset: AssetRef,
    app_handle: AppHandle,
) -> IpcResult<MapGeometryState> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        let bytes = asset.read(&config, &app_handle.state::<WadCache>())?;
        let document = MapGeometryDocument::parse(&bytes)?;

        let documents = app_handle.state::<MapGeometryDocuments>();
        let id = documents.next.fetch_add(1, Ordering::Relaxed);
        let open = OpenGeometry { document, asset };
        let state = state_of(id, &open);
        documents.open.lock().insert(id, Arc::new(Mutex::new(open)));
        Ok(state)
    })
    .await
}

/// Closes the `.mapgeo` open under `id`, dropping its unsaved changes.
#[tauri::command]
#[specta::specta]
pub async fn map_geometry_close(id: MapGeometryId, app_handle: AppHandle) -> IpcResult<()> {
    app_handle
        .state::<MapGeometryDocuments>()
        .open
        .lock()
        .remove(&id);
    IpcResult::ok(())
}

/// Every mesh of the `.mapgeo` open under `id`, in file order.
#[tauri::command]
#[specta::specta]
pub async fn map_geometry_meshes(
    id: MapGeometryId,
    app_handle: AppHandle,
) -> IpcResult<Vec<MapGeometryMesh>> {
    off_thread(move || {
        let open = app_handle.state::<MapGeometryDocuments>().get(id)?;
        let meshes = open.lock().document.meshes();
        Ok(meshes)
    })
    .await
}

/// Applies `edit` to the `.mapgeo` open under `id` as one undo step.
#[tauri::command]
#[specta::specta]
pub async fn map_geometry_edit(
    id: MapGeometryId,
    edit: MapGeometryEdit,
    app_handle: AppHandle,
) -> IpcResult<MapGeometryChange> {
    off_thread(move || {
        let open = app_handle.state::<MapGeometryDocuments>().get(id)?;
        let mut open = open.lock();
        let deltas = open.document.edit(edit)?;
        Ok(MapGeometryChange {
            state: state_of(id, &open),
            deltas,
        })
    })
    .await
}

/// Reverts the last edit of the `.mapgeo` open under `id`, or redoes the last undone one.
///
/// Returns `None` if the history holds no step to take.
#[tauri::command]
#[specta::specta]
pub async fn map_geometry_step(
    id: MapGeometryId,
    undo: bool,
    app_handle: AppHandle,
) -> IpcResult<Option<MapGeometryChange>> {
    off_thread(move || {
        let open = app_handle.state::<MapGeometryDocuments>().get(id)?;
        let mut open = open.lock();
        let stepped = if undo {
            open.document.undo()?
        } else {
            open.document.redo()?
        };
        Ok(stepped.map(|deltas| MapGeometryChange {
            state: state_of(id, &open),
            deltas,
        }))
    })
    .await
}

/// Writes the `.mapgeo` open under `id` and returns the layer file it now reads from.
///
/// A layer file is written in place. A game file is written to `path` in the archive folder
/// of the layer that the open bin `materials` writes to, which is where the map's other edits
/// land. The write goes through a temporary file.
///
/// # Errors
///
/// Fails if the layer file changed on disk since it was read, if the game file has no
/// project layer to land in, or if the bake or the write fails.
#[tauri::command]
#[specta::specta]
pub async fn map_geometry_save(
    id: MapGeometryId,
    materials: BinDocumentId,
    path: String,
    app_handle: AppHandle,
) -> IpcResult<AssetRef> {
    off_thread(move || {
        let open = app_handle.state::<MapGeometryDocuments>().get(id)?;
        let mut open = open.lock();

        let (target, saved, project) = match &open.asset {
            AssetRef::Layer { project, .. } => {
                let target = open
                    .asset
                    .layer_file()
                    .expect("a layer asset names a layer file")?;
                let on_disk = fs::read(&target)?;
                if !open.document.is_base(&on_disk) {
                    return Err(AppError::ValidationFailed(format!(
                        "{} changed on disk since it was opened. Reopen the map to edit it.",
                        target.display()
                    )));
                }
                (target, open.asset.clone(), project.clone())
            }
            game => {
                let write = WriteTarget::of(&app_handle.state::<BinDocuments>(), materials)?;
                let archive = archive_of(game).ok_or_else(|| {
                    AppError::ValidationFailed("The map geometry is in no archive".to_owned())
                })?;
                let relative = format!("{archive}/{}", path.to_lowercase());
                let saved = AssetRef::Layer {
                    project: write.project.clone(),
                    layer: write.layer.clone(),
                    path: relative,
                };
                let target = saved
                    .layer_file()
                    .expect("a layer asset names a layer file")?;
                (target, saved, write.project)
            }
        };

        let bytes = open.document.to_bytes()?;
        write_file(&target, &bytes)?;
        open.document.saved_as(&bytes);
        open.asset = saved.clone();

        app_handle.state::<SandboxState>().invalidate(&project);
        Ok(saved)
    })
    .await
}

fn write_file(target: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(target, bytes)?;
    Ok(())
}
