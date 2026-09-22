//! The shader pipeline's read: materials with the game's own shaders translated for the
//! viewport.

use super::document_assets::{read_resolved, with_resolution};
use super::off_thread;
use crate::error::{AppResult, IpcResult};
use crate::state::{get_app_data_dir, SettingsState};
use hexshade::TranslationCache;
use ltk_hash::{BinHash, Hash as _};
use ltk_manager_core::bin_document::{AssetLookup, BinDocument, BinDocumentId, RowNames};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::material::SHADER_DEFS_PATH;
use ltk_manager_core::object_index::parse_hash;
use ltk_manager_core::preview::AssetRef;
use ltk_manager_game::program::{read_programs, MaterialProgram, ProgramOptions, Resolution};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

/// Where the materials a program read names are declared.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[derive(specta::Type)]
pub enum MaterialSource {
    /// An open document, such as a skin's bin.
    Document { document: BinDocumentId },
    /// A bin read for the call, such as a map's `.materials.bin`, resolved against the
    /// project of `document` where one is open and against the install alone otherwise.
    File {
        asset: AssetRef,
        document: Option<BinDocumentId>,
    },
}

/// The materials `entries` name, each with a translated program per pass.
///
/// An entry is an object hash as `0x` and eight hex digits, or an object path, which is
/// hashed. The answer is one for one and in order, null where the bin declares no object
/// under the entry. The shader defs are read beside the bin, the project's copy first,
/// and a read they refuse leaves every pass without a shader and says so. Translations
/// are kept under the app's data directory by the blob's hash.
///
/// # Errors
///
/// Fails when the source bin cannot be read or parsed.
#[tauri::command]
#[specta::specta]
pub async fn read_material_programs(
    source: MaterialSource,
    entries: Vec<String>,
    options: ProgramOptions,
    app_handle: AppHandle,
) -> IpcResult<Vec<Option<MaterialProgram>>> {
    off_thread(move || {
        let entries: Vec<BinHash> = entries
            .iter()
            .map(|entry| parse_hash(entry).unwrap_or_else(|| BinHash::hash_str(entry)))
            .collect();
        let translations = TranslationCache::new(
            get_app_data_dir(&app_handle)
                .map(|dir| dir.join("shaders"))
                .as_deref(),
        );
        let programs = |bin: &BinDocument, names: &dyn RowNames, assets: &dyn AssetLookup| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
            let shaders = assets.locate(SHADER_DEFS_PATH).and_then(|asset| {
                read(&asset)
                    .and_then(|bytes| Ok(BinDocument::parse(bytes)?))
                    .inspect_err(|e| tracing::debug!(?asset, "Passed over the shader defs: {e}"))
                    .ok()
            });
            let resolution = Resolution {
                document: bin,
                names,
                assets,
                shaders: shaders.as_ref(),
            };
            Ok(read_programs(
                resolution,
                &entries,
                options,
                &translations,
                &mut read,
            ))
        };

        match source {
            MaterialSource::Document { document } => read_resolved(&app_handle, document, programs),
            MaterialSource::File { asset, document } => {
                with_resolution(&app_handle, document, |names, assets| {
                    let config = app_handle.state::<SettingsState>().config();
                    let wads = app_handle.state::<WadCache>();
                    let bin = BinDocument::parse(asset.read(&config, &wads)?)?;
                    programs(&bin, names, assets)
                })
            }
        }
    })
    .await
}
