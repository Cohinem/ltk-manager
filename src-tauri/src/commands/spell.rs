//! The isolated missile preview's document read.

use super::document_assets::parse_entry;
use super::off_thread;
use crate::error::IpcResult;
use ltk_manager_core::bin_document::{BinDocumentId, BinDocuments};
use ltk_manager_core::spell::{read_spell as read, SpellPreview};
use tauri::{AppHandle, Manager};

/// The missile inputs written on one spell in an open document.
#[tauri::command]
#[specta::specta]
pub async fn read_spell(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<SpellPreview> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let open = app_handle.state::<BinDocuments>().document(document)?;
        Ok(read(&open, entry)?)
    })
    .await
}
