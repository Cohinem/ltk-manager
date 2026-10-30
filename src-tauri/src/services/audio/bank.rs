//! The open event banks that take edits: their edits, undo, save, and the copy of a game bank
//! into a project layer on its first edit. "Editing" in `docs/ux/AUDIO.md`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use fs_err as fs;
use ltk_manager_assets::game_wads::WadCache;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{AudioFile, BankEdit, BankNode, EventBankDocument, OpenedBank};
use ltk_manager_base::utils::fs::atomic_write;
use ltk_manager_bin::bin_document::BASE_LAYER;
use ltk_manager_bin::sandbox::{SandboxRef, SandboxState};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::events::{bank_path, with_event_bank, BankSource};
use super::index::game_audio_index;
use super::references::with_site_names;
use crate::error::{AppError, AppResult, IpcResult};
use crate::services::shared::{archive_of, off_thread};
use crate::state::SettingsState;

/// The id of an open event bank. Ids are never reused.
pub type AudioBankId = u32;

/// One open event bank, the asset that it reads from and saves to, and its sandbox.
struct OpenBank {
    document: EventBankDocument,
    /// The layer file, loose file or game chunk of the bank. A game chunk becomes a layer file on
    /// the first edit.
    asset: AssetRef,
    sandbox: SandboxRef,
    /// The game path of the bank, which its bank units name it by.
    path: String,
}

/// Every open event bank, by id.
#[derive(Default)]
pub struct AudioBankDocuments {
    open: Mutex<HashMap<AudioBankId, Arc<Mutex<OpenBank>>>>,
    next: AtomicU32,
}

impl AudioBankDocuments {
    fn get(&self, id: AudioBankId) -> AppResult<Arc<Mutex<OpenBank>>> {
        self.open
            .lock()
            .get(&id)
            .cloned()
            .ok_or_else(|| AppError::ValidationFailed(format!("No event bank is open as {id}")))
    }

    /// Returns the bank open under `id` with its edits, as the first file of a bank set.
    pub(super) fn opened(&self, id: AudioBankId) -> AppResult<OpenedBank> {
        let open = self.get(id)?;
        let open = open.lock();
        Ok(opened_of(&open))
    }
}

fn opened_of(open: &OpenBank) -> OpenedBank {
    OpenedBank {
        path: open.path.clone(),
        file: AudioFile {
            asset: open.asset.clone(),
            contents: open.document.bytes().to_vec(),
        },
    }
}

/// Where an open event bank stands after a change.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioBankState {
    pub id: AudioBankId,
    /// Counts every change.
    pub revision: u64,
    /// The document holds changes that no save wrote.
    pub dirty: bool,
    /// The bank is version 145 with a hierarchy, so it takes edits.
    pub editable: bool,
    /// The version of the bank.
    pub version: u32,
    /// The file that a save writes. A game chunk's copy in the project after the first edit.
    pub asset: AssetRef,
    /// The IDs of the objects whose bytes differ from the bank as it was opened, in file order.
    pub edited: Vec<u32>,
}

fn state_of(id: AudioBankId, open: &OpenBank) -> AudioBankState {
    AudioBankState {
        id,
        revision: open.document.revision(),
        dirty: open.document.is_dirty(),
        editable: open.document.is_editable(),
        version: open.document.version(),
        asset: open.asset.clone(),
        edited: open.document.edited().into_iter().map(|id| id.0).collect(),
    }
}

/// Opens the event bank `asset` in `sandbox` as a document that takes edits.
///
/// # Errors
///
/// Fails if the asset cannot be read or is not a bank.
#[tauri::command]
#[specta::specta]
pub async fn audio_bank_open(
    sandbox: SandboxRef,
    asset: AssetRef,
    app_handle: AppHandle,
) -> IpcResult<AudioBankState> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        let bytes = asset.read(&config, &app_handle.state::<WadCache>())?;
        let document = EventBankDocument::parse(bytes)?;
        let path = with_site_names(&app_handle, &sandbox, |_, rows| bank_path(&asset, rows))?;

        let documents = app_handle.state::<AudioBankDocuments>();
        let id = documents.next.fetch_add(1, Ordering::Relaxed);
        let open = OpenBank {
            document,
            asset,
            sandbox,
            path,
        };
        let state = state_of(id, &open);
        documents.open.lock().insert(id, Arc::new(Mutex::new(open)));
        Ok(state)
    })
    .await
}

/// Closes the event bank open under `id`, dropping its unsaved changes.
#[tauri::command]
#[specta::specta]
pub async fn audio_bank_close(id: AudioBankId, app_handle: AppHandle) -> IpcResult<()> {
    app_handle
        .state::<AudioBankDocuments>()
        .open
        .lock()
        .remove(&id);
    IpcResult::ok(())
}

/// Applies `edit` to the event bank open under `id` as one undo step.
///
/// The bank set of the bank checks every new target, child and source. The first edit of a game
/// chunk writes the chunk into the project layer of the sandbox, the selected layer or the base
/// layer, and the document saves there after.
///
/// # Errors
///
/// Fails if the document refuses the edit, if a game chunk opens in no project, if the project
/// already has a file at the chunk's path, or if the copy cannot be written.
#[tauri::command]
#[specta::specta]
pub async fn audio_bank_edit(
    id: AudioBankId,
    edit: BankEdit,
    app_handle: AppHandle,
) -> IpcResult<AudioBankState> {
    off_thread(move || {
        let open = app_handle.state::<AudioBankDocuments>().get(id)?;
        let mut open = open.lock();
        let copy = layer_copy(&open.sandbox, &open.asset, &open.path)?;
        let before = open.document.revision();
        let base = copy.as_ref().map(|_| open.document.bytes().to_vec());

        let (game, _) = game_audio_index(&app_handle);
        let sandbox = open.sandbox.clone();
        let opened = opened_of(&open);
        with_event_bank(
            &app_handle,
            &sandbox,
            BankSource::Opened(opened),
            game.as_deref(),
            |bank| Ok(open.document.edit(&edit, bank.set())?),
        )?;

        if let (Some(target), Some(base)) = (copy, base) {
            if open.document.revision() != before {
                if let Err(error) = write_copy(&target, &base) {
                    open.document.undo()?;
                    return Err(error);
                }
                tracing::info!(
                    ?target,
                    "Copied a game event bank into the project on its first edit"
                );
                invalidate(&app_handle, &target);
                open.asset = target;
            }
        }
        Ok(state_of(id, &open))
    })
    .await
}

/// Reverts the last edit of the event bank open under `id`, or redoes the last undone one.
///
/// Returns `None` if the history holds no step to take.
#[tauri::command]
#[specta::specta]
pub async fn audio_bank_step(
    id: AudioBankId,
    undo: bool,
    app_handle: AppHandle,
) -> IpcResult<Option<AudioBankState>> {
    off_thread(move || {
        let open = app_handle.state::<AudioBankDocuments>().get(id)?;
        let mut open = open.lock();
        let stepped = if undo {
            open.document.undo()?
        } else {
            open.document.redo()?
        };
        Ok(stepped.then(|| state_of(id, &open)))
    })
    .await
}

/// Writes the event bank open under `id` to its file through a temporary file.
///
/// # Errors
///
/// Fails if the bank is still a game chunk, if its file changed on disk since it was read or
/// last saved, or if the write fails.
#[tauri::command]
#[specta::specta]
pub async fn audio_bank_save(id: AudioBankId, app_handle: AppHandle) -> IpcResult<AudioBankState> {
    off_thread(move || {
        let open = app_handle.state::<AudioBankDocuments>().get(id)?;
        let mut open = open.lock();
        if !open.document.is_dirty() {
            return Ok(state_of(id, &open));
        }

        let target = saved_file(&open.asset)?;
        let on_disk = fs::read(&target)?;
        if !open.document.is_base(&on_disk) {
            return Err(AppError::ValidationFailed(format!(
                "{} changed on disk since it was opened. Reopen the bank to edit it.",
                target.display()
            )));
        }

        atomic_write(&target, open.document.bytes())?;
        open.document.mark_saved();
        invalidate(&app_handle, &open.asset);
        Ok(state_of(id, &open))
    })
    .await
}

/// Lists the sounds and containers of the bank set of the event bank open under `id`, which an
/// edit adds as a child or a Play target.
#[tauri::command]
#[specta::specta]
pub async fn audio_bank_nodes(id: AudioBankId, app_handle: AppHandle) -> IpcResult<Vec<BankNode>> {
    off_thread(move || {
        let documents = app_handle.state::<AudioBankDocuments>();
        let opened = documents.opened(id)?;
        let sandbox = documents.get(id)?.lock().sandbox.clone();
        let (game, _) = game_audio_index(&app_handle);

        with_event_bank(
            &app_handle,
            &sandbox,
            BankSource::Opened(opened),
            game.as_deref(),
            |bank| Ok(bank.nodes()),
        )
    })
    .await
}

/// Returns the layer file that the first edit of `asset` copies the bank into, or `None` for an
/// asset that is a file already.
///
/// The layer is the one that `sandbox` names, else the base layer. The path is the chunk's game
/// path below its archive folder, or its hash and `.bnk` for a chunk without a name.
///
/// # Errors
///
/// Fails for a game chunk in the game sandbox and for a client chunk.
pub(super) fn layer_copy(
    sandbox: &SandboxRef,
    asset: &AssetRef,
    path: &str,
) -> AppResult<Option<AssetRef>> {
    match asset {
        AssetRef::Layer { .. } | AssetRef::File { .. } => Ok(None),
        AssetRef::LcuChunk { .. } => Err(AppError::ValidationFailed(
            "A League client file takes no edit".to_owned(),
        )),
        AssetRef::GameChunk { path_hash, .. } => {
            let (project, layer) = match sandbox {
                SandboxRef::Game => {
                    return Err(AppError::ValidationFailed(
                        "The game sandbox takes no edit. Open the bank in a project to edit it."
                            .to_owned(),
                    ));
                }
                SandboxRef::Project { project } => (project, BASE_LAYER),
                SandboxRef::Layer { project, layer } => (project, layer.as_str()),
            };
            let archive = archive_of(asset).ok_or_else(|| {
                AppError::ValidationFailed("The event bank is in no archive".to_owned())
            })?;
            let file = if path == path_hash {
                format!("{path_hash}.bnk")
            } else {
                path.to_lowercase()
            };

            Ok(Some(AssetRef::Layer {
                project: project.clone(),
                layer: layer.to_owned(),
                path: format!("{archive}/{file}"),
            }))
        }
    }
}

/// Returns the file on disk that a save of `asset` writes.
fn saved_file(asset: &AssetRef) -> AppResult<PathBuf> {
    match asset {
        AssetRef::Layer { .. } => asset
            .layer_file()
            .expect("a layer asset names a layer file"),
        AssetRef::File { path } => Ok(PathBuf::from(path)),
        AssetRef::GameChunk { .. } | AssetRef::LcuChunk { .. } => Err(AppError::ValidationFailed(
            "The bank is a game file with no edit, so there is nothing to save".to_owned(),
        )),
    }
}

/// Writes `bytes` as the layer file `target`, which must not exist yet.
fn write_copy(target: &AssetRef, bytes: &[u8]) -> AppResult<()> {
    let file = saved_file(target)?;
    if file.exists() {
        return Err(AppError::ValidationFailed(format!(
            "The project already has {}. Open that file to edit the bank.",
            file.display()
        )));
    }
    if let Some(parent) = Path::new(&file).parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(&file, bytes)?;
    Ok(())
}

/// Drops the sandbox snapshots of the project of `asset`, whose layer files changed.
fn invalidate(app: &AppHandle, asset: &AssetRef) {
    if let AssetRef::Layer { project, .. } = asset {
        app.state::<SandboxState>().invalidate(project);
    }
}
