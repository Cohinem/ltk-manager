//! Mod files Explorer opens the app with, batched and held until the frontend listens.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use fs_err as fs;
use ltk_manager_runtime::integrations::file_types::ModFileType;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{Emitter, Manager};

/// How long a batch stays open after its latest file, for the rest of an Explorer multi-select.
///
/// Explorer starts one process per selected file, and each reaches this one
/// through the single-instance plugin a few milliseconds after the last.
const BATCH_WINDOW: Duration = Duration::from_millis(300);

/// The event a batch of opened mod files is heard on.
const FILES_OPENED: &str = "files-opened";

/// Mod files the reader opened from Explorer, as one batch.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FilesOpened {
    pub paths: Vec<String>,
}

/// The batch being collected, and the batches no listener has heard yet.
#[derive(Debug, Default)]
struct Batches {
    listening: bool,
    collecting: Vec<PathBuf>,
    latest: Option<Instant>,
    pending: Vec<PathBuf>,
}

impl Batches {
    /// Adds paths to the open batch at `now`, and whether they opened it.
    fn add(&mut self, paths: Vec<PathBuf>, now: Instant) -> bool {
        let opened = self.latest.is_none();
        self.collecting.extend(paths);
        self.latest = Some(now);
        opened
    }

    /// How long the open batch still waits for another file, or `None` once it is due.
    fn remaining(&self, now: Instant) -> Option<Duration> {
        let quiet = now.saturating_duration_since(self.latest?);
        BATCH_WINDOW
            .checked_sub(quiet)
            .filter(|left| !left.is_zero())
    }

    /// Closes the open batch: the paths to send now, or `None` where they are held.
    fn close(&mut self) -> Option<Vec<PathBuf>> {
        self.latest = None;
        let mut batch = std::mem::take(&mut self.collecting);
        let mut seen = HashSet::new();
        batch.retain(|path| seen.insert(path.clone()));

        if !self.listening {
            self.pending.extend(batch);
            return None;
        }

        Some(batch)
    }

    /// The held paths, and marks the frontend listening from here on.
    fn take_pending(&mut self) -> Vec<PathBuf> {
        self.listening = true;
        std::mem::take(&mut self.pending)
    }
}

/// The batching state behind [`open`] and [`take_pending`].
#[derive(Default)]
pub struct OpenedFilesState(Mutex<Batches>);

/// The mod files among a command line's arguments, resolved against `cwd`.
///
/// An argument counts when it names an existing file with a mod extension.
pub fn mod_files(argv: &[String], cwd: &Path) -> Vec<PathBuf> {
    argv.iter()
        .skip(1)
        .map(|arg| cwd.join(arg))
        .filter(|path| ModFileType::of(path).is_some())
        .filter(|path| fs::metadata(path).is_ok_and(|m| m.is_file()))
        .collect()
}

/// Queues opened mod files, sending the batch once no file has arrived for [`BATCH_WINDOW`].
///
/// No rate limit applies, because every file in a multi-select arrives inside
/// the window a link's limiter would drop all but the first of.
pub fn open(app_handle: &tauri::AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }

    tracing::info!(count = paths.len(), "Received mod files to open");

    let state: tauri::State<'_, OpenedFilesState> = app_handle.state();
    if !state.0.lock().add(paths, Instant::now()) {
        return;
    }

    let app_handle = app_handle.clone();
    std::thread::spawn(move || {
        let state: tauri::State<'_, OpenedFilesState> = app_handle.state();
        let mut wait = BATCH_WINDOW;

        loop {
            std::thread::sleep(wait);

            let mut batches = state.0.lock();
            if let Some(left) = batches.remaining(Instant::now()) {
                wait = left;
                continue;
            }

            let Some(batch) = batches.close() else {
                return;
            };

            super::raise_main_window(&app_handle);
            let _ = app_handle.emit(FILES_OPENED, payload(batch));
            return;
        }
    });
}

/// The files opened before the frontend was listening.
pub fn take_pending(app_handle: &tauri::AppHandle) -> FilesOpened {
    let state: tauri::State<'_, OpenedFilesState> = app_handle.state();
    let pending = state.0.lock().take_pending();
    if !pending.is_empty() {
        super::raise_main_window(app_handle);
    }

    payload(pending)
}

fn payload(paths: Vec<PathBuf>) -> FilesOpened {
    FilesOpened {
        paths: paths
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect(),
    }
}

#[cfg(test)]
mod tests;
