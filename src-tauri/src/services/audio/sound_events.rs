//! The events that a sound field of an open bin suggests: the bank units of the bin's character
//! skin, and any event of the game that a search matches. "A sound field" in
//! `docs/ux/BIN_EDITOR.md`.

use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{scope_bins, scoped_units, AudioIndex};
use ltk_manager_bin::sandbox::SandboxRef;
use serde::Serialize;
use tauri::AppHandle;

use super::events::game_path;
use super::index::{game_audio_index, project_audio_index};
use super::references::with_site_names;
use crate::error::IpcResult;
use crate::services::shared::off_thread;

/// One bank unit whose events a sound field suggests.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScopedEvents {
    /// The `name` of the unit, such as `Lux_Skin07_SFX`.
    pub unit: String,
    /// The game path of the bin that declares the unit.
    pub bin: String,
    /// The `events` list of the unit.
    pub events: Vec<String>,
}

/// The event names of the game that a search matches.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EventSearch {
    /// The first matches, shortest name first.
    pub names: Vec<String>,
    /// How many names matched, including those past `names`.
    pub total: u32,
}

/// Lists the bank units whose events a sound field of the bin `asset` suggests.
///
/// The units are those of the character skin bin with the bin's skin number, then those of the
/// base skin, each read from the project where it edits the skin bin. Returns no unit for a bin
/// outside `data/characters/`.
///
/// # Errors
///
/// Fails if the install's game index cannot be built.
#[tauri::command]
#[specta::specta]
pub async fn audio_scoped_events(
    sandbox: SandboxRef,
    asset: AssetRef,
    app_handle: AppHandle,
) -> IpcResult<Vec<ScopedEvents>> {
    off_thread(move || {
        let bin = with_site_names(&app_handle, &sandbox, |_, rows| game_path(&asset, rows))?;
        let bins = scope_bins(&bin);
        if bins.is_empty() {
            return Ok(Vec::new());
        }

        let (game, _) = game_audio_index(&app_handle);
        let project = sandbox.project().map(project_audio_index);
        let indexes: Vec<&AudioIndex> = project.iter().chain(game.as_deref()).collect();
        let scoped: Vec<ScopedEvents> = scoped_units(&bins, &indexes)
            .into_iter()
            .map(|indexed| ScopedEvents {
                unit: indexed.unit.name.clone(),
                bin: indexed.bin.clone(),
                events: indexed.unit.events.clone(),
            })
            .collect();

        tracing::debug!(
            bin,
            units = scoped.len(),
            "Listed the bank units that a sound field of a bin suggests"
        );
        Ok(scoped)
    })
    .await
}

/// Searches the event names of the game for `query`, and returns at most `limit` of them.
///
/// A name matches if it contains every whitespace-separated term of `query`, without ASCII case.
/// Returns no name while the game's audio index is not built.
#[tauri::command]
#[specta::specta]
pub async fn audio_search_events(
    query: String,
    limit: u32,
    app_handle: AppHandle,
) -> IpcResult<EventSearch> {
    off_thread(move || {
        let (game, _) = game_audio_index(&app_handle);
        let Some(game) = game else {
            return Ok(EventSearch {
                names: Vec::new(),
                total: 0,
            });
        };

        let found = game.search_events(&query, usize::try_from(limit).unwrap_or(usize::MAX));
        Ok(EventSearch {
            names: found.names.into_iter().map(str::to_owned).collect(),
            total: u32::try_from(found.total).unwrap_or(u32::MAX),
        })
    })
    .await
}
