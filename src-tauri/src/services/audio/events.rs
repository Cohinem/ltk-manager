//! The events of an event bank, and the play tree of one event.

use ltk_hash::WadHash;
use ltk_manager_assets::game_wads::WadCache;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{
    AudioEventList, AudioFile, AudioIndex, EventBank, EventTree, ObjectId, OpenedBank,
};
use ltk_manager_base::error::AppError;
use ltk_manager_bin::bin_document::RowNames;
use ltk_manager_bin::sandbox::SandboxRef;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::index::{chunk_path, game_audio_index, project_audio_index, AudioIndexStatus};
use super::references::with_site_names;
use super::{preview_error, with_audio_files};
use crate::error::{AppResult, IpcResult};
use crate::services::shared::off_thread;
use crate::state::SettingsState;

/// The events of an event bank, and the slot of the game's audio index that named them.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioEventsResponse {
    /// The events of the bank and the files of its bank set.
    pub list: AudioEventList,
    /// Off `ready`, the names and bank units of the game are missing from the list.
    pub index: AudioIndexStatus,
}

/// The play tree of one event, and the slot of the game's audio index that resolved it.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioEventResponse {
    /// The play tree of the event.
    pub tree: EventTree,
    /// Off `ready`, the tree has no media from the bank units of the game.
    pub index: AudioIndexStatus,
}

/// List the events of the event bank `asset`, opened in `sandbox`, with the status of each tree.
///
/// The bank set is the bank, then the files of the bank units that name it in the project's
/// bins and in the game's audio index. "Event tree" in `docs/ux/AUDIO.md`.
#[tauri::command]
#[specta::specta]
pub async fn read_audio_events(
    sandbox: SandboxRef,
    asset: AssetRef,
    app_handle: AppHandle,
) -> IpcResult<AudioEventsResponse> {
    off_thread(move || {
        let (game, index) = game_audio_index(&app_handle);
        let list = with_event_bank(&app_handle, &sandbox, &asset, game.as_deref(), |bank| {
            Ok(bank.events())
        })?;
        tracing::debug!(
            events = list.events.len(),
            files = list.files.len(),
            origin = ?list.origin,
            ?index,
            "Listed the events of an event bank"
        );
        Ok(AudioEventsResponse { list, index })
    })
    .await
}

/// Resolve the event `event` of the event bank `asset` into its play tree.
///
/// Fails with `VALIDATION_FAILED` if the bank contains no event `event`, and with a preview error
/// that names the object if an object of the tree cannot be decoded.
#[tauri::command]
#[specta::specta]
pub async fn read_audio_event(
    sandbox: SandboxRef,
    asset: AssetRef,
    event: u32,
    app_handle: AppHandle,
) -> IpcResult<AudioEventResponse> {
    off_thread(move || {
        let (game, index) = game_audio_index(&app_handle);
        let tree = with_event_bank(&app_handle, &sandbox, &asset, game.as_deref(), |bank| {
            bank.event(ObjectId(event))
                .map_err(preview_error)?
                .ok_or_else(|| {
                    AppError::ValidationFailed(format!("The bank contains no event {event}"))
                })
        })?;
        Ok(AudioEventResponse { tree, index })
    })
    .await
}

/// Opens the event bank `asset` in `sandbox` with the project's audio index and `game`, and
/// runs `read` on it.
fn with_event_bank<T>(
    app: &AppHandle,
    sandbox: &SandboxRef,
    asset: &AssetRef,
    game: Option<&AudioIndex>,
    read: impl FnOnce(&EventBank) -> AppResult<T>,
) -> AppResult<T> {
    let config = app.state::<SettingsState>().config();
    let contents = asset.read(&config, &app.state::<WadCache>())?;
    let project = sandbox.project().map(project_audio_index);
    let indexes: Vec<&AudioIndex> = project.iter().chain(game).collect();

    let bank = with_site_names(app, sandbox, |names, rows| {
        let opened = OpenedBank {
            path: bank_path(asset, rows),
            file: AudioFile {
                asset: asset.clone(),
                contents,
            },
        };
        with_audio_files(app, sandbox, |files, locale| {
            EventBank::open(opened, &indexes, files, locale, names)
        })
    })??;
    read(&bank)
}

/// Returns the game path of the bank `asset`.
///
/// A game chunk and a layer file that an unpack named by its hash take the path that `names`
/// gives the hash. A file outside the game is named by its file name.
pub(crate) fn bank_path(asset: &AssetRef, names: &dyn RowNames) -> String {
    match asset {
        AssetRef::GameChunk { path_hash, .. } | AssetRef::LcuChunk { path_hash, .. } => asset
            .chunk_hash()
            .and_then(|hash| names.chunk_name(hash))
            .unwrap_or_else(|| path_hash.clone()),
        AssetRef::Layer { path, .. } => {
            let chunk = chunk_path(path);
            hashed_chunk(chunk)
                .and_then(|hash| names.chunk_name(hash))
                .unwrap_or_else(|| chunk.to_owned())
        }
        AssetRef::File { path } => path.rsplit(['/', '\\']).next().unwrap_or(path).to_owned(),
    }
}

/// Returns the hash of a chunk path that an unpack wrote as sixteen hex digits and an extension.
fn hashed_chunk(path: &str) -> Option<WadHash> {
    let name = path.rsplit('/').next()?;
    let stem = name.split_once('.').map_or(name, |(stem, _)| stem);
    if stem.len() != HASH_DIGITS {
        return None;
    }
    u64::from_str_radix(stem, 16).ok().map(WadHash)
}

/// The number of hex digits of a chunk path hash.
const HASH_DIGITS: usize = 16;
