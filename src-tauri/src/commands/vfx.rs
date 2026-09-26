//! The particle renderer's read: one system's whole value tree in one call.
//!
//! The tree is the open document's (ADR-0026), and this answers a subtree of it with
//! every reference resolved rather than a window of rows.

use super::bin::installed_schema;
use super::document_assets::{parse_entry, read_resolved};
use super::material::shader_defs;
use super::off_thread;
use crate::error::IpcResult;
use ltk_manager_core::bin_document::BinDocumentId;
use ltk_manager_core::meta_schema::SchemaNames;
use ltk_manager_core::vfx::{resolve_system, VfxSystem};
use tauri::AppHandle;

/// One particle system of an open document, with every reference resolved.
///
/// `entry` is the object's hash as `0x` and eight hex digits. A class or field the hash
/// tables leave unnamed takes the meta schema's name.
#[tauri::command]
#[specta::specta]
pub async fn read_vfx_system(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<VfxSystem> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let (schema, _) = installed_schema(&app_handle);
        read_resolved(&app_handle, document, |open, names, assets| {
            let shaders = shader_defs(&app_handle, assets);
            let names = SchemaNames::new(names, &schema);
            Ok(resolve_system(
                open,
                entry,
                &names,
                assets,
                shaders.as_deref(),
            )?)
        })
    })
    .await
}
