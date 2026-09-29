//! The shader pipeline's read: materials with the game's own shaders translated for the
//! viewport.

use super::document_assets::{read_resolved, with_resolution};
use super::off_thread;
use crate::error::{AppResult, IpcResult};
use crate::state::{get_app_data_dir, SettingsState};
use std::sync::Arc;

use hexshade::TranslationCache;
use ltk_hash::{BinHash, Hash as _};
use ltk_manager_core::bin_document::{AssetLookup, BinDocument, BinDocumentId, RowNames};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::material::defs::ShaderDefsCache;
use ltk_manager_core::material::SHADER_DEFS_PATH;
use ltk_manager_core::object_index::parse_hash;
use ltk_manager_core::preview::AssetRef;
use ltk_manager_game::map::MapPath;
use ltk_manager_game::program::{
    read_embedded_program, read_programs, MaterialProgram, ParticleDefine, ParticleShader,
    PassProgram, ProgramOptions, Resolution,
};
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
    /// A bin read for the call, such as a file a skin links, resolved against the
    /// project of `document` where one is open and against the install alone otherwise.
    File {
        asset: AssetRef,
        document: Option<BinDocumentId>,
    },
    /// A map's `.materials.bin`, located as `read_map` locates it: in the project of
    /// `document` first, where one is open, and in the install second.
    Map {
        map: MapPath,
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
        let entries: Vec<BinHash> = entries.iter().map(|entry| entry_hash(entry)).collect();
        let absent = vec![None; entries.len()];
        let translations = translations(&app_handle);
        on_source(&app_handle, source, absent, |resolution, read| {
            read_programs(resolution, &entries, options, &translations, read)
        })
    })
    .await
}

/// The material embedded at the property path `path` under the object `entry`, with a
/// translated program per pass, and null where the path reaches no struct.
///
/// The entry is read as [`read_material_programs`] reads one, and the program is keyed by
/// the hash of `entry:path`, since the material has no object of its own.
///
/// # Errors
///
/// Fails when the source bin cannot be read or parsed.
#[tauri::command]
#[specta::specta]
pub async fn read_embedded_material_program(
    source: MaterialSource,
    entry: String,
    path: String,
    options: ProgramOptions,
    app_handle: AppHandle,
) -> IpcResult<Option<MaterialProgram>> {
    off_thread(move || {
        let entry = entry_hash(&entry);
        let translations = translations(&app_handle);
        on_source(&app_handle, source, None, |resolution, read| {
            read_embedded_program(resolution, entry, &path, options, &translations, read)
        })
    })
    .await
}

/// An entry as an object hash, `0x` and eight hex digits, or an object path, which is hashed.
fn entry_hash(entry: &str) -> BinHash {
    parse_hash(entry).unwrap_or_else(|| BinHash::hash_str(entry))
}

/// `read` over the bin `source` names, resolved with its shader defs, and `absent` for a
/// map with no materials bin.
fn on_source<T>(
    app_handle: &AppHandle,
    source: MaterialSource,
    absent: T,
    read: impl FnOnce(Resolution<'_>, &mut dyn FnMut(&AssetRef) -> AppResult<Vec<u8>>) -> T,
) -> AppResult<T> {
    let resolved = |bin: &BinDocument, names: &dyn RowNames, assets: &dyn AssetLookup| {
        let config = app_handle.state::<SettingsState>().config();
        let wads = app_handle.state::<WadCache>();
        let mut bytes = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
        let shaders = shader_defs(app_handle, assets);
        let resolution = Resolution {
            document: bin,
            names,
            assets,
            shaders: shaders.as_deref(),
        };
        Ok(read(resolution, &mut bytes))
    };
    let parsed = |asset: &AssetRef| -> AppResult<BinDocument> {
        let config = app_handle.state::<SettingsState>().config();
        let wads = app_handle.state::<WadCache>();
        Ok(BinDocument::parse(asset.read(&config, &wads)?)?)
    };

    match source {
        MaterialSource::Document { document } => read_resolved(app_handle, document, resolved),
        MaterialSource::File { asset, document } => {
            with_resolution(app_handle, document, |names, assets| {
                resolved(&parsed(&asset)?, names, assets)
            })
        }
        MaterialSource::Map { map, document } => {
            with_resolution(app_handle, document, |names, assets| {
                let Some(asset) = assets.locate(&map.materials()) else {
                    return Ok(absent);
                };
                resolved(&parsed(&asset)?, names, assets)
            })
        }
    }
}

/// The pass the engine draws a skinned submesh with where its skin names no material,
/// with `LIT_UBER` translated.
///
/// The shader cache is the one `document` resolves against. Translations are cached as
/// [`read_material_programs`] caches them.
///
/// # Errors
///
/// Fails when no document is open under `document`.
#[tauri::command]
#[specta::specta]
pub async fn read_default_skinned_program(
    document: BinDocumentId,
    options: ProgramOptions,
    app_handle: AppHandle,
) -> IpcResult<PassProgram> {
    off_thread(move || {
        let translations = translations(&app_handle);
        read_resolved(&app_handle, document, |_, _, assets| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
            Ok(ltk_manager_game::program::read_default_skinned_program(
                assets,
                options,
                &translations,
                &mut read,
            ))
        })
    })
    .await
}

/// An engine particle shader's pass for the defines an emitter sets, translated.
///
/// The shader cache is the one `document` resolves against, and the install's alone where
/// it is none. Translations are cached as [`read_material_programs`] caches them.
///
/// # Errors
///
/// Fails when the names or the project chunks the resolution reads are unavailable.
#[tauri::command]
#[specta::specta]
pub async fn read_particle_program(
    document: Option<BinDocumentId>,
    shader: ParticleShader,
    defines: Vec<ParticleDefine>,
    options: ProgramOptions,
    app_handle: AppHandle,
) -> IpcResult<PassProgram> {
    off_thread(move || {
        let translations = translations(&app_handle);
        with_resolution(&app_handle, document, |_, assets| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
            Ok(ltk_manager_game::program::read_particle_program(
                assets,
                shader,
                &defines,
                options,
                &translations,
                &mut read,
            ))
        })
    })
    .await
}

/// The translations kept under the app's data directory, or none kept where it has none.
pub(super) fn translations(app_handle: &AppHandle) -> TranslationCache {
    TranslationCache::new(
        get_app_data_dir(app_handle)
            .map(|dir| dir.join("shaders"))
            .as_deref(),
    )
}

/// The shader defs `assets` locates, parsed once per version of the file, or none where
/// the resolution has no copy or its bytes are not a bin.
pub(super) fn shader_defs(
    app_handle: &AppHandle,
    assets: &dyn AssetLookup,
) -> Option<Arc<BinDocument>> {
    let asset = assets.locate(SHADER_DEFS_PATH)?;
    let config = app_handle.state::<SettingsState>().config();
    let wads = app_handle.state::<WadCache>();

    asset
        .read(&config, &wads)
        .and_then(|bytes| Ok(app_handle.state::<ShaderDefsCache>().defs(&asset, bytes)?))
        .inspect_err(|e| tracing::debug!(?asset, "Passed over the shader defs: {e}"))
        .ok()
}
