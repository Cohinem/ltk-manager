//! The sounds a viewport plays: event names resolved into play trees over an open document.

use ltk_manager_audio::{resolve_sounds as resolve, AudioIndex, BankUnit, BinAudio, ResolvedSound};
use ltk_manager_base::error::AppError;
use ltk_manager_bin::bin_document::{BinDocumentId, BinDocuments};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::index::{game_audio_index, project_audio_index, AudioIndexStatus};
use super::with_audio_files;
use crate::error::{AppResult, IpcResult};
use crate::services::shared::document_assets::sandbox_of;
use crate::services::shared::off_thread;

/// The sounds of a view, and the slot of the game's audio index that they were resolved with.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSounds {
    /// One entry per name asked for, in the same order.
    pub sounds: Vec<ResolvedSound>,
    /// Off `ready`, a name that only the game's bank units register reads as missing.
    pub index: AudioIndexStatus,
}

/// Resolve each of `names` into the play tree of its event, for a viewport of `document`.
///
/// The bank set is every `BankUnit` of the open document and one unit of `bank_paths`, then the
/// bank units that the project's bins and the game's audio index register each missing name in.
/// "Viewport sound" in `docs/ux/AUDIO.md`.
#[tauri::command]
#[specta::specta]
pub async fn resolve_sounds(
    document: BinDocumentId,
    names: Vec<String>,
    bank_paths: Vec<String>,
    app_handle: AppHandle,
) -> IpcResult<ResolvedSounds> {
    off_thread(move || {
        let mut own = document_units(&app_handle, document)?;
        if !bank_paths.is_empty() {
            own.push(paths_unit(bank_paths));
        }
        let sandbox = sandbox_of(&app_handle, Some(document));
        let (game, index) = game_audio_index(&app_handle);
        let project = sandbox.project().map(project_audio_index);
        let indexes: Vec<&AudioIndex> = project.iter().chain(game.as_deref()).collect();

        let sounds = with_audio_files(&app_handle, &sandbox, |files, locale| {
            resolve(&own, &names, &indexes, files, locale)
        })?;
        tracing::debug!(
            names = names.len(),
            units = own.len(),
            ?index,
            "Resolved the sounds of a view"
        );
        Ok(ResolvedSounds { sounds, index })
    })
    .await
}

/// Returns every `BankUnit` of the open document `document`, in file order.
fn document_units(app: &AppHandle, document: BinDocumentId) -> AppResult<Vec<BankUnit>> {
    let open = app.state::<BinDocuments>().document(document)?;
    let objects = open.entries().filter_map(|entry| open.object_at(entry));
    let audio = BinAudio::of_objects(objects).map_err(|e| {
        AppError::Other(format!("The bank units of the document were not read: {e}"))
    })?;
    Ok(audio.units.into_iter().map(|sited| sited.unit).collect())
}

/// Returns a bank unit that reads `bank_paths`, such as the `AudioBankPaths` of a spell.
///
/// The unit is read as voice-over, so a path with an `en_US` segment reads under the client's
/// locale first. A path without one reads as written.
fn paths_unit(bank_paths: Vec<String>) -> BankUnit {
    BankUnit {
        bank_path: bank_paths,
        voice_over: true,
        ..BankUnit::default()
    }
}
