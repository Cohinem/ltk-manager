//! Atlas's reads: a view controller resolved into what it draws, a font, and the UI programs.

use super::document_assets::{parse_entry, read_resolved, with_resolution};
use super::material::translations;
use super::off_thread;
use crate::error::{AppError, AppResult, IpcResult};
use crate::state::SettingsState;
use atlas::{
    import_sprite, read_sheet, resolve_font, resolve_scene_bin, resolve_view, SheetImport,
    SheetSpec, SheetTarget, UiFont, UiShader, UiView, VariantChoice, FONTS_PATH,
};
use ltk_hash::WadHash;
use ltk_manager_core::bin_document::{BinDocument, BinDocumentId, BinDocuments, Namer, RowNames};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::preview::AssetRef;
use ltk_manager_core::sandbox::{SandboxRef, SandboxState};
use ltk_manager_game::program::ProgramRead;
use serde::Deserialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

/// A variant a view draws over its base: the override slot, and its open document where one is.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(specta::Type)]
pub struct ViewVariant {
    pub slot: String,
    pub document: Option<BinDocumentId>,
}

/// The view controller at `entry` in the open document `document`, with its base scene bin,
/// its manifest and every sprite resolved through the document's sandbox.
///
/// `scene` is the open document of the base scene bin, which the view draws as it stands in
/// place of the file. `variant` is laid over that base as the client lays an override.
///
/// # Errors
///
/// Fails when `entry` is no object hash or the document has no object under it. A file or
/// sprite the view cannot reach is a warning on the answer.
#[tauri::command]
#[specta::specta]
pub async fn read_ui_view(
    document: BinDocumentId,
    entry: String,
    scene: Option<BinDocumentId>,
    variant: Option<ViewVariant>,
    app_handle: AppHandle,
) -> IpcResult<UiView> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let documents = app_handle.state::<BinDocuments>();
        let scene = scene.map(|scene| documents.document(scene)).transpose()?;
        let variant_open = variant
            .as_ref()
            .and_then(|variant| variant.document)
            .map(|open| documents.document(open))
            .transpose()?;
        let choice = variant.as_ref().map(|variant| VariantChoice {
            slot: &variant.slot,
            open: variant_open.as_deref(),
        });

        read_resolved(&app_handle, document, |open, names, assets| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
            resolve_view(
                open,
                entry,
                scene.as_deref(),
                choice,
                names,
                assets,
                &mut read,
            )
            .map_err(|e| AppError::ValidationFailed(e.to_string()))
        })
    })
    .await
}

/// The scene bin open as `document`, drawn as a view of its own for the element at `entry`: its
/// scenes and elements as they stand, with the manifest of the folder the file sits in.
///
/// # Errors
///
/// Fails when `entry` is no object hash, the document is closed or it has no object under it.
#[tauri::command]
#[specta::specta]
pub async fn read_ui_scene_view(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<UiView> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let asset = app_handle
            .state::<BinDocuments>()
            .asset_of(document)
            .ok_or_else(|| {
                AppError::ValidationFailed(format!("Document {document} is not open"))
            })?;
        read_resolved(&app_handle, document, |open, names, assets| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
            let path = chunk_path(&asset, names);
            resolve_scene_bin(
                open,
                entry,
                &path,
                Some(asset.clone()),
                names,
                assets,
                &mut read,
            )
            .map_err(|e| AppError::ValidationFailed(e.to_string()))
        })
    })
    .await
}

/// The chunk path an asset stands for, which names the folder its manifest sits under: a game
/// chunk's by its hash, and a project or disk file's own.
fn chunk_path(asset: &AssetRef, names: &dyn RowNames) -> String {
    match asset {
        AssetRef::GameChunk { path_hash, .. } => u64::from_str_radix(path_hash, 16)
            .ok()
            .and_then(|hash| Namer::new(names).chunk(WadHash(hash)))
            .unwrap_or_else(|| path_hash.clone()),
        AssetRef::Layer { path, .. } | AssetRef::File { path } => path.replace('\\', "/"),
    }
}

/// Import the PNG at `source` into the sheet `sheet` of the project `document` opens in, or put
/// it in place of the sprite `replace`, per section 5 of docs/plans/atlas-ui-editor.md.
///
/// A new sheet's page lands in the layer the document declares into, and in the archive folder
/// its own bin comes from.
///
/// # Errors
///
/// Fails when the document is closed or opens in no project, when the image cannot be read, and
/// when the sheet would outgrow one page.
#[tauri::command]
#[specta::specta]
pub async fn atlas_import_sprite(
    document: BinDocumentId,
    sheet: String,
    source: String,
    replace: Option<String>,
    app_handle: AppHandle,
) -> IpcResult<SheetImport> {
    off_thread(move || {
        let documents = app_handle.state::<BinDocuments>();
        let project = project_of(&documents, document)?;
        let asset = documents
            .asset_of(document)
            .ok_or_else(|| not_open(document))?;
        let layer = match (documents.declared_state(document)?, &asset) {
            (Some(declared), _) => declared.layer,
            (None, AssetRef::Layer { layer, .. }) => layer.clone(),
            (None, _) => {
                return Err(AppError::ValidationFailed(
                    "The document writes to no layer".to_owned(),
                ))
            }
        };
        let archive = archive_of(&asset).ok_or_else(|| {
            AppError::ValidationFailed("The document is in no archive".to_owned())
        })?;

        let target = SheetTarget {
            project: Path::new(&project),
            sheet: &sheet,
            layer: &layer,
            archive: &archive,
        };
        let imported = import_sprite(&target, Path::new(&source), replace.as_deref())?;
        app_handle.state::<SandboxState>().invalidate(&project);
        Ok(imported)
    })
    .await
}

/// The spec of the sheet `sheet` of the project `document` opens in, none where it has not made
/// that sheet.
///
/// # Errors
///
/// Fails when the document is closed or opens in no project, and when the spec cannot be read.
#[tauri::command]
#[specta::specta]
pub async fn atlas_sheet(
    document: BinDocumentId,
    sheet: String,
    app_handle: AppHandle,
) -> IpcResult<Option<SheetSpec>> {
    off_thread(move || {
        let project = project_of(&app_handle.state::<BinDocuments>(), document)?;
        read_sheet(Path::new(&project), &sheet)
    })
    .await
}

fn project_of(documents: &BinDocuments, document: BinDocumentId) -> AppResult<String> {
    match documents.sandbox_of(document) {
        Some(SandboxRef::Project { project } | SandboxRef::Layer { project, .. }) => Ok(project),
        Some(SandboxRef::Game) => Err(AppError::ValidationFailed(
            "The document opens in no project".to_owned(),
        )),
        None => Err(not_open(document)),
    }
}

fn not_open(document: BinDocumentId) -> AppError {
    AppError::ValidationFailed(format!("Document {document} is not open"))
}

/// The archive folder a layer keeps an asset's archive under: a game chunk's archive file name,
/// or the first folder of a layer file's path.
fn archive_of(asset: &AssetRef) -> Option<String> {
    match asset {
        AssetRef::GameChunk { wad, .. } => {
            wad.replace('\\', "/").rsplit('/').next().map(str::to_owned)
        }
        AssetRef::Layer { path, .. } => path
            .replace('\\', "/")
            .split('/')
            .next()
            .filter(|archive| archive.contains(".wad"))
            .map(str::to_owned),
        AssetRef::File { .. } => None,
    }
}

/// The `GameFontDescription` at `entry` in the open document `document`, its links followed
/// into the document and then into the `ux/fonts` its sandbox resolves.
///
/// # Errors
///
/// Fails when `entry` is no object hash or neither bin holds an object under it.
#[tauri::command]
#[specta::specta]
pub async fn read_ui_font(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<UiFont> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        read_resolved(&app_handle, document, |open, names, assets| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let fonts = assets
                .locate(FONTS_PATH)
                .and_then(|asset| asset.read(&config, &wads).ok())
                .and_then(|bytes| BinDocument::parse(bytes).ok());
            resolve_font(open, entry, fonts.as_ref(), names, assets)
                .map_err(|e| AppError::ValidationFailed(e.to_string()))
        })
    })
    .await
}

/// The programs of `shaders`, one for one and in that order, translated.
///
/// The shaders are the ones `document` resolves against, and the install's alone where it
/// is none. Translations are cached as `read_material_programs` caches them.
///
/// # Errors
///
/// Fails when the names or the project chunks the resolution reads are unavailable.
#[tauri::command]
#[specta::specta]
pub async fn read_ui_programs(
    document: Option<BinDocumentId>,
    shaders: Vec<UiShader>,
    app_handle: AppHandle,
) -> IpcResult<Vec<ProgramRead>> {
    off_thread(move || {
        let translations = translations(&app_handle);
        with_resolution(&app_handle, document, |_, assets| {
            let config = app_handle.state::<SettingsState>().config();
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> { asset.read(&config, &wads) };
            Ok(atlas::read_ui_programs(
                assets,
                &shaders,
                &translations,
                &mut read,
            ))
        })
    })
    .await
}
