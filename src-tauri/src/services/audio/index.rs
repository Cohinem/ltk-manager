//! The audio index of the installed game, built in the background once per game build, and the
//! audio index of a project's own bins.

use std::sync::Arc;
use std::time::Instant;

use fs_err as fs;
use ltk_manager_audio::{read_game, AudioIndex, BinAudio, GameFile};
use ltk_manager_base::budget::{files_at_once, Budget};
use ltk_manager_base::game_build::GameBuild;
use ltk_manager_base::utils::fs::atomic_write;
use ltk_manager_bin::object_index::layer_bins;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::services::game::index::built_game_index;
use crate::state::SettingsState;

/// The file under the game index cache directory that holds the audio index.
const CACHE_FILE: &str = "audio.bin";

/// The slot of the game's audio index, as a response reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum AudioIndexStatus {
    /// A build runs on a background thread. Names and bank units of the game are missing.
    Building,
    Ready,
    /// The last build failed. The next read after the game build changes retries it.
    Failed {
        message: String,
    },
}

/// The managed audio index of the installed game.
#[derive(Debug, Default)]
pub struct AudioIndexState(Mutex<Slot>);

#[derive(Debug, Default)]
enum Slot {
    #[default]
    Absent,
    Building {
        build: Option<GameBuild>,
    },
    Ready {
        build: Option<GameBuild>,
        index: Arc<AudioIndex>,
    },
    Failed {
        build: Option<GameBuild>,
        message: String,
    },
}

/// Returns the audio index of the installed game, and the slot that it is in.
///
/// Returns `None` while a build runs or after a build failed. If no index matches the installed
/// game build, the call starts a build on a background thread and returns at once.
pub(crate) fn game_audio_index(app: &AppHandle) -> (Option<Arc<AudioIndex>>, AudioIndexStatus) {
    let build = GameBuild::installed(&app.state::<SettingsState>().config());
    let state = app.state::<AudioIndexState>();
    let mut slot = state.0.lock();

    match &*slot {
        Slot::Ready { build: held, index } if *held == build => {
            return (Some(Arc::clone(index)), AudioIndexStatus::Ready);
        }
        Slot::Building { build: held } if *held == build => {
            return (None, AudioIndexStatus::Building);
        }
        Slot::Failed {
            build: held,
            message,
        } if *held == build => {
            return (
                None,
                AudioIndexStatus::Failed {
                    message: message.clone(),
                },
            );
        }
        _ => {}
    }

    *slot = Slot::Building { build };
    drop(slot);

    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let built = load_or_build(&app, build);
        let state = app.state::<AudioIndexState>();
        let mut slot = state.0.lock();
        if !matches!(&*slot, Slot::Building { build: held } if *held == build) {
            return;
        }
        *slot = match built {
            Ok(index) => Slot::Ready {
                build,
                index: Arc::new(index),
            },
            Err(e) => {
                tracing::warn!("The audio index of the game was not built: {e}");
                Slot::Failed {
                    build,
                    message: e.to_string(),
                }
            }
        };
    });
    (None, AudioIndexStatus::Building)
}

/// Reads the audio index of `build` from the cache, or builds it over the game and writes it
/// there. A game without a known build is built and not cached.
fn load_or_build(app: &AppHandle, build: Option<GameBuild>) -> AppResult<AudioIndex> {
    let key = build.map(|build| build.to_string());
    let cache = crate::state::game_index_cache_dir(app).map(|dir| dir.join(CACHE_FILE));

    if let (Some(key), Some(cache)) = (&key, &cache) {
        let cached = fs::read(cache)
            .ok()
            .and_then(|bytes| AudioIndex::from_bytes(&bytes, key));
        if let Some(index) = cached {
            tracing::info!(build = %key, "Loaded the audio index from its cache");
            return Ok(index);
        }
    }

    let started = Instant::now();
    let config = app.state::<SettingsState>().config();
    let (game, archives) = built_game_index(app, &config)?;
    let mut files = Vec::new();
    game.for_each_named_file(|path_hash, path, wad| {
        files.push(GameFile {
            wad: game.wads()[wad as usize].clone(),
            path_hash,
            path: path.to_owned(),
        });
    });

    let index = read_game(&archives, &files, files_at_once(), &Budget::sweep());
    tracing::info!(
        units = index.units().len(),
        names = index.name_count(),
        sources = index.source_count(),
        elapsed_ms = started.elapsed().as_millis() as u64,
        "Built the audio index of the game"
    );

    if let (Some(key), Some(cache)) = (&key, &cache) {
        let written = cache
            .parent()
            .map_or(Ok(()), fs::create_dir_all)
            .and_then(|()| atomic_write(cache, &index.to_bytes(key)));
        if let Err(e) = written {
            tracing::warn!(
                "The audio index was not written to {}: {e}",
                cache.display()
            );
        }
    }
    Ok(index)
}

/// Returns the audio index of the bins of `project`'s layers.
///
/// A bin that does not read is skipped and logged.
pub(crate) fn project_audio_index(project: &str) -> AudioIndex {
    let bins = layer_bins(project).unwrap_or_else(|e| {
        tracing::warn!(
            project,
            "Failed to list the bins of the project's layers, so the audio index of the project \
             has no bank units. Check that the project folder can be read: {e}"
        );
        Vec::new()
    });

    let mut builder = AudioIndex::builder();
    for bin in bins {
        let audio = fs::read(&bin.path)
            .map_err(|e| e.to_string())
            .and_then(|bytes| BinAudio::read(&bytes).map_err(|e| e.to_string()));
        match audio {
            Ok(audio) => builder.add_bin(chunk_path(&bin.file), audio),
            Err(e) => tracing::debug!(file = %bin.file, "Skipped a bin in the audio index: {e}"),
        }
    }
    builder.build()
}

/// Returns the chunk path of the layer file `file`: its path below the archive directory.
pub(crate) fn chunk_path(file: &str) -> &str {
    file.split_once('/').map_or(file, |(_, chunk)| chunk)
}
