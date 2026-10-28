//! The bytes of an asset, read through the shared WAD cache under the current settings.

use ltk_manager_assets::game_wads::WadCache;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_bin::bin_document::BinDocument;
use ltk_manager_bin::sandbox::SandboxRef;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::services::shared::installed::ProjectGame;
use crate::state::SettingsState;

/// The bytes of `asset`.
pub(crate) fn read_asset(app: &AppHandle, asset: &AssetRef) -> AppResult<Vec<u8>> {
    asset.read(
        &app.state::<SettingsState>().config(),
        &app.state::<WadCache>(),
    )
}

/// The bin document `asset` holds.
pub(crate) fn read_bin(app: &AppHandle, asset: &AssetRef) -> AppResult<BinDocument> {
    Ok(BinDocument::parse(read_asset(app, asset)?)?)
}

/// A reader of many assets, under the settings as they are now.
pub(crate) fn asset_reader(app: &AppHandle) -> impl FnMut(&AssetRef) -> AppResult<Vec<u8>> + '_ {
    let config = app.state::<SettingsState>().config();
    let wads = app.state::<WadCache>();

    move |asset| asset.read(&config, &wads)
}

/// A reader of the bins a document of `sandbox` links, which passes over one it cannot read.
///
/// A game chunk is read as the sandbox's project builds it, with the project's game data
/// declarations applied, so an object that a declaration creates in a linked bin resolves.
pub(crate) fn linked_reader<'a>(
    app: &'a AppHandle,
    sandbox: &SandboxRef,
) -> impl FnMut(&AssetRef) -> Option<BinDocument> + 'a {
    let sandbox = sandbox.clone();
    /* The declarations load on the first linked bin, and a read that links none skips them. */
    let mut game: Option<ProjectGame> = None;

    move |asset| {
        let game = game.get_or_insert_with(|| ProjectGame::new(app, &sandbox));
        match game
            .read(asset)
            .and_then(|bytes| Ok(BinDocument::parse(bytes)?))
        {
            Ok(bin) => Some(bin),
            Err(e) => {
                tracing::debug!(?asset, "Passed over a linked bin: {e}");
                None
            }
        }
    }
}
