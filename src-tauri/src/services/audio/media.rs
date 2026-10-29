//! The media table of one audio file, and the export of one media.

use std::path::Path;

use ltk_manager_assets::game_wads::WadCache;
use ltk_manager_assets::preview::{AssetInfo, AssetRef};
use ltk_manager_audio::{audio_info, media, media_rows, MediaRow, SoundCache, SourceId};
use ltk_manager_base::config::Config;
use ltk_manager_base::error::{AppError, DomainError, ErrorKind};
use ltk_manager_base::utils::fs::atomic_write;
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::{cached_sound, SoundFailure};
use crate::error::{AppResult, IpcResult};
use crate::services::shared::off_thread;
use crate::state::SettingsState;

/// What a media export writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MediaExport {
    /// The decoded media: Ogg Vorbis for Vorbis, WAV for PCM.
    Decoded,
    /// The WEM bytes as the file holds them.
    Original,
}

/// List the media of a package, a media bank or a WEM, one row per source ID.
#[tauri::command]
#[specta::specta]
pub async fn read_audio_media(asset: AssetRef, app_handle: AppHandle) -> IpcResult<Vec<MediaRow>> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        asset_media(&asset, &config, &app_handle.state::<WadCache>())
    })
    .await
}

/// Write the media `source` of an audio file to `destination`, through a temporary file.
#[tauri::command]
#[specta::specta]
pub async fn export_audio_media(
    asset: AssetRef,
    source: u32,
    form: MediaExport,
    destination: String,
    app_handle: AppHandle,
) -> IpcResult<()> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        let bytes = exported_media(
            &asset,
            SourceId(source),
            form,
            &app_handle.state::<SoundCache>(),
            &config,
            &app_handle.state::<WadCache>(),
        )?;

        atomic_write(Path::new(&destination), &bytes)?;
        tracing::info!(destination = %destination, source, ?form, "Exported an audio media");
        Ok(())
    })
    .await
}

/// Reports what `asset` holds, as an [`AssetInfo::Audio`] for a Wwise file.
///
/// # Errors
///
/// Fails if the asset cannot be read, or if the header of a file of another kind does not
/// parse.
pub(crate) fn asset_info(
    asset: &AssetRef,
    config: &Config,
    wads: &WadCache,
) -> AppResult<AssetInfo> {
    let bytes = asset.read(config, wads)?;

    match audio_info(asset.name(), &bytes) {
        Some(audio) => Ok(AssetInfo::Audio(audio)),
        None => asset.info_from(&bytes),
    }
}

/// Lists the media of the audio file `asset`.
///
/// # Errors
///
/// Fails if the asset cannot be read, is no Wwise file, or its package or bank does not read.
pub(crate) fn asset_media(
    asset: &AssetRef,
    config: &Config,
    wads: &WadCache,
) -> AppResult<Vec<MediaRow>> {
    media_rows(&asset.read(config, wads)?).map_err(preview_error)
}

/// Returns the bytes that an export of the media `source` of `asset` writes.
///
/// A decoded export reads through `cache`, which the `sound` preview form shares.
///
/// # Errors
///
/// Fails if the asset cannot be read, holds no media `source`, or the media cannot be decoded.
pub(crate) fn exported_media(
    asset: &AssetRef,
    source: SourceId,
    form: MediaExport,
    cache: &SoundCache,
    config: &Config,
    wads: &WadCache,
) -> AppResult<Vec<u8>> {
    match form {
        MediaExport::Decoded => cached_sound(cache, asset, source, || asset.read(config, wads))
            .map(|decoded| decoded.bytes.clone())
            .map_err(|failure| match failure {
                SoundFailure::Read(error) => error,
                SoundFailure::Sound(error) => preview_error(error),
            }),
        MediaExport::Original => {
            let file = asset.read(config, wads)?;
            Ok(media(&file, source).map_err(preview_error)?.into_owned())
        }
    }
}

fn preview_error(error: impl std::error::Error + Send + Sync + 'static) -> AppError {
    AppError::Domain(DomainError::new(ErrorKind::Preview, error))
}
