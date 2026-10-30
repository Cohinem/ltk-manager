//! The `audio` service: the media table of an audio file, the export of one media, the events of
//! an event bank, the audio index, bank sets over the sandbox and the cache of decoded media.
//!
//! The `sound` form of the `ltk-asset` protocol reads through [`decoded_sound`].

mod bank;
mod convert;
mod events;
mod index;
mod linked;
mod media;
mod references;
mod sounds;
mod voice_lines;

pub use bank::*;
pub use convert::AudioConvertError;
pub use events::*;
pub use index::AudioIndexState;
pub use media::*;
pub use references::*;
pub use sounds::*;
pub use voice_lines::*;

use std::io::{self, Cursor};
use std::sync::Arc;

use ltk_manager_assets::game_wads::WadCache;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::SourceId;
use ltk_manager_audio::{sound, AudioFile, AudioFiles, Decoded, ReadSeek, SoundCache, SoundError};
use ltk_manager_base::config::Config;
use ltk_manager_base::utils::game::GameDir;
use ltk_manager_bin::bin_document::AssetLookup;
use ltk_manager_bin::sandbox::SandboxRef;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Wry};

use crate::error::AppResult;
use crate::services::shared::document_assets::with_assets_in;
use crate::state::SettingsState;

/// The audio service's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the audio commands.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>().build()
}

/// [`AudioFiles`] over the asset lookup of a sandbox: project layer files first, then the game.
pub(crate) struct SandboxAudioFiles<'a> {
    assets: &'a dyn AssetLookup,
    config: &'a Config,
    wads: &'a WadCache,
}

impl SandboxAudioFiles<'_> {
    fn located(&self, path: &str) -> io::Result<Option<AudioFile<Vec<u8>>>> {
        let Some(asset) = self.assets.locate(path) else {
            return Ok(None);
        };

        let contents = asset
            .read(self.config, self.wads)
            .map_err(|e| io::Error::other(e.to_string()))?;
        Ok(Some(AudioFile { asset, contents }))
    }
}

impl AudioFiles for SandboxAudioFiles<'_> {
    fn read(&self, path: &str) -> io::Result<Option<AudioFile<Vec<u8>>>> {
        self.located(path)
    }

    /* A chunk decompresses whole, so a package opens over its bytes in memory. The mount
    still reads only the entry records. */
    fn open(&self, path: &str) -> io::Result<Option<AudioFile<Box<dyn ReadSeek>>>> {
        Ok(self.located(path)?.map(|file| AudioFile {
            asset: file.asset,
            contents: Box::new(Cursor::new(file.contents)) as Box<dyn ReadSeek>,
        }))
    }
}

/// Runs `read` with the audio files of the sandbox `reference` and the client's locale.
///
/// # Errors
///
/// Fails if the install's game index cannot be built.
pub(crate) fn with_audio_files<T>(
    app: &AppHandle,
    reference: &SandboxRef,
    read: impl FnOnce(&dyn AudioFiles, Option<&str>) -> T,
) -> AppResult<T> {
    let config = app.state::<SettingsState>().config();
    let wads = app.state::<WadCache>();
    let locale = GameDir::resolve(&config)
        .ok()
        .and_then(|game_dir| game_dir.locale());

    with_assets_in(app, reference, |assets| {
        let files = SandboxAudioFiles {
            assets,
            config: &config,
            wads: &wads,
        };
        read(&files, locale.as_deref())
    })
}

/// Why the `sound` form gives no media.
#[derive(Debug)]
pub(crate) enum SoundFailure {
    /// The asset cannot be read.
    Read(crate::error::AppError),
    /// The asset gives no sound for the source ID.
    Sound(SoundError),
}

/// Returns the decoded media `source` of `asset` from `cache`, and reads it with `read` once.
///
/// # Errors
///
/// Fails with [`SoundFailure::Read`] if `read` fails, and with [`SoundFailure::Sound`] if the
/// asset contains no such media or the media cannot be decoded.
pub(crate) fn cached_sound(
    cache: &SoundCache,
    asset: &AssetRef,
    source: SourceId,
    read: impl FnOnce() -> AppResult<Vec<u8>>,
) -> Result<Arc<Decoded>, SoundFailure> {
    cache.get_or_decode(asset, source, || {
        let file = read().map_err(SoundFailure::Read)?;
        sound(&file, source).map_err(SoundFailure::Sound)
    })
}

/// Returns the decoded media `source` of `asset`, from the cache of the app.
///
/// A media file that an open event bank document imported media into is read as the document
/// holds it, so an unsaved import plays. The source ID of an imported media is drawn from the
/// hash of its WEM, so a cached decode of the ID is of the same media.
///
/// # Errors
///
/// The errors of [`cached_sound`].
pub(crate) fn decoded_sound(
    app: &AppHandle,
    asset: &AssetRef,
    source: SourceId,
) -> Result<Arc<Decoded>, SoundFailure> {
    cached_sound(&app.state::<SoundCache>(), asset, source, || {
        if let Some(bytes) = app.state::<AudioBankDocuments>().media_bytes(asset) {
            return Ok(bytes);
        }
        asset.read(
            &app.state::<SettingsState>().config(),
            &app.state::<WadCache>(),
        )
    })
}

#[cfg(test)]
mod tests;
