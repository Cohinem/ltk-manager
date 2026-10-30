//! The sounds a viewport plays: event names resolved into play trees over an open document.

use ltk_hash::BinHash;
use ltk_manager_audio::{resolve_sounds as resolve, AudioIndex, BankUnit, BinAudio, ResolvedSound};
use ltk_manager_base::error::AppError;
use ltk_manager_bin::bin_document::{BinDocumentId, BinDocuments};
use ltk_manager_bin::sandbox::SandboxRef;
use ltk_manager_game::skin_bin;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::index::{game_audio_index, project_audio_index, AudioIndexStatus};
use super::with_audio_files;
use crate::error::{AppResult, IpcResult};
use crate::services::shared::document_assets::{sandbox_of, with_names_in};
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
/// A document without a `BankUnit` takes the units of the skin bins that the paths of its
/// objects name, such as a VFX bin that a skin links. "Viewport sound" in `docs/ux/AUDIO.md`.
#[tauri::command]
#[specta::specta]
pub async fn resolve_sounds(
    document: BinDocumentId,
    names: Vec<String>,
    bank_paths: Vec<String>,
    app_handle: AppHandle,
) -> IpcResult<ResolvedSounds> {
    off_thread(move || {
        let sandbox = sandbox_of(&app_handle, Some(document));
        let (game, index) = game_audio_index(&app_handle);
        let project = sandbox.project().map(project_audio_index);
        let indexes: Vec<&AudioIndex> = project.iter().chain(game.as_deref()).collect();

        let mut units = document_units(&app_handle, document)?;
        if units.is_empty() {
            let objects = object_paths(&app_handle, document, &sandbox)?;
            units = skin_units(&objects, &indexes);
        }
        if !bank_paths.is_empty() {
            units.push(paths_unit(bank_paths));
        }

        let sounds = with_audio_files(&app_handle, &sandbox, |files, locale| {
            resolve(&units, &names, &indexes, files, locale)
        })?;
        tracing::debug!(
            names = names.len(),
            units = units.len(),
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

/// Returns the paths of the objects of the open document `document` that a table names.
fn object_paths(
    app: &AppHandle,
    document: BinDocumentId,
    sandbox: &SandboxRef,
) -> AppResult<Vec<String>> {
    let open = app.state::<BinDocuments>().document(document)?;
    let entries: Vec<BinHash> = open.entries().collect();

    Ok(with_names_in(app, sandbox, |names| {
        entries
            .into_iter()
            .filter_map(|entry| names.entry_name(entry))
            .collect()
    }))
}

/// Returns the bank units of the skin bins that `objects` name by their paths, such as
/// `Characters/Ahri/Skins/Skin7/Particles/Ahri_Skin07_Q` for `data/characters/ahri/skins/skin7.bin`.
///
/// A skin takes its units from the first of `indexes` that declares any unit in its bin, so a
/// project's copy of the skin bin wins over the game's.
pub(super) fn skin_units(objects: &[String], indexes: &[&AudioIndex]) -> Vec<BankUnit> {
    let mut skins: Vec<String> = Vec::new();
    for skin in objects.iter().filter_map(|path| skin_bin(path)) {
        if !skins.contains(&skin) {
            skins.push(skin);
        }
    }

    let mut units = Vec::new();
    for skin in &skins {
        let declared = indexes.iter().find_map(|index| {
            let found: Vec<BankUnit> = index
                .units()
                .iter()
                .filter(|indexed| indexed.bin.eq_ignore_ascii_case(skin))
                .map(|indexed| indexed.unit.clone())
                .collect();
            (!found.is_empty()).then_some(found)
        });
        units.extend(declared.unwrap_or_default());
    }
    units
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
