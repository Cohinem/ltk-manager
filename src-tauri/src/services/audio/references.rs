//! The bank units and bank lists that name an audio file, and the site names that write their
//! rows.

use ltk_hash::BinHash;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{AudioIndex, BankReferences, BankUnitGroup, SiteNames, SiteRow};
use ltk_manager_bin::bin_document::{AssetLookup, RowNames};
use ltk_manager_bin::meta_schema::SchemaNames;
use ltk_manager_bin::sandbox::SandboxRef;
use serde::Serialize;
use tauri::AppHandle;

use super::events::bank_path;
use super::index::{game_audio_index, project_audio_index, AudioIndexStatus};
use crate::error::{AppResult, IpcResult};
use crate::services::shared::document_assets::{with_assets_in, with_names_in};
use crate::services::shared::installed::installed_schema;
use crate::services::shared::off_thread;

/// The bank units and bank lists that name an audio file, and the slot of the game's index.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BankReferencesResponse {
    /// The game path that the units name the file by.
    pub path: String,
    /// The bank units that name the file, grouped.
    pub units: Vec<BankUnitGroup>,
    /// The `AudioBankPaths` and `BankPaths` rows that list the file.
    pub lists: Vec<SiteRow>,
    /// Off `ready`, the units and lists of the game are missing.
    pub index: AudioIndexStatus,
}

/// List the bank units and bank lists that name the audio file `asset`, opened in `sandbox`.
///
/// The project's bins come first, then the game's audio index. A loose file names itself by
/// its file name, so no unit names it. "Bank units" in `docs/ux/AUDIO.md`.
#[tauri::command]
#[specta::specta]
pub async fn read_bank_references(
    sandbox: SandboxRef,
    asset: AssetRef,
    app_handle: AppHandle,
) -> IpcResult<BankReferencesResponse> {
    off_thread(move || {
        let (game, index) = game_audio_index(&app_handle);
        let project = sandbox.project().map(project_audio_index);
        let indexes: Vec<&AudioIndex> = project.iter().chain(game.as_deref()).collect();

        let (path, references) = with_site_names(&app_handle, &sandbox, |names, rows| {
            let path = bank_path(&asset, rows);
            let references = BankReferences::of(&path, &indexes, names);
            (path, references)
        })?;
        tracing::debug!(
            path,
            units = references.units.len(),
            declarations = references
                .units
                .iter()
                .map(|group| group.declarations.len())
                .sum::<usize>(),
            lists = references.lists.len(),
            ?index,
            "Listed the bank units that name an audio file"
        );

        Ok(BankReferencesResponse {
            path,
            units: references.units,
            lists: references.lists,
            index,
        })
    })
    .await
}

/// Runs `read` with the site names of the sandbox `reference` and its row names.
///
/// # Errors
///
/// Fails if the install's game index cannot be built.
pub(crate) fn with_site_names<T>(
    app: &AppHandle,
    reference: &SandboxRef,
    read: impl FnOnce(&dyn SiteNames, &dyn RowNames) -> T,
) -> AppResult<T> {
    let (schema, _) = installed_schema(app);
    with_names_in(app, reference, |names| {
        let names = SchemaNames::new(names, &schema);
        with_assets_in(app, reference, |assets| {
            read(
                &SandboxSiteNames {
                    names: &names,
                    assets,
                },
                &names,
            )
        })
    })
}

/// [`SiteNames`] over the hash tables and the asset lookup of a sandbox.
pub(super) struct SandboxSiteNames<'a> {
    pub(super) names: &'a dyn RowNames,
    pub(super) assets: &'a dyn AssetLookup,
}

impl SiteNames for SandboxSiteNames<'_> {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        self.assets.locate(path)
    }

    fn object_name(&self, hash: u32) -> Option<String> {
        self.names.entry_name(BinHash(hash))
    }

    fn class_name(&self, hash: u32) -> Option<String> {
        self.names.class_name(BinHash(hash))
    }

    fn field_name(&self, hash: u32) -> Option<String> {
        self.names.field_name(BinHash(hash))
    }

    /* A spell condition hashes an object path, which `binentries` names, and a situation key
    hashes a plain string, which `binhashes` names. */
    fn hash_name(&self, hash: u32) -> Option<String> {
        self.names
            .value_name(BinHash(hash))
            .or_else(|| self.names.entry_name(BinHash(hash)))
    }
}
