//! The passes that bring the library in line with disk when the app starts.
//!
//! Each of the three is defined by the module that owns it. This is only the
//! order they run in, which is the one thing none of them can decide alone.

use crate::config::Config;
use crate::events::BackendEvent;
use crate::mods::ModLibrary;

use super::layout_migration::LayoutMigrationState;

impl ModLibrary {
    /// Bring the library in line with what is on disk, off the startup path.
    ///
    /// Runs on a detached thread so the Tauri event loop starts immediately and
    /// IPC stays responsive instead of blocking on a disk scan. Emits
    /// `library-changed` when anything moved, so the frontend refetches.
    pub fn maintain_in_background(&self, config: Config) {
        let library = self.clone();
        std::thread::spawn(move || library.maintain(&config));
    }

    /// The three startup passes, in the order their dependencies demand.
    ///
    /// The sweep goes first because startup is the one moment nothing can be
    /// mid-install, which is what makes clearing another process's staging
    /// directories safe. The layout migration goes before reconciliation
    /// because reconciliation refuses to run while a mod is still in the uuid
    /// layout — it would read one mid-move as an orphan.
    fn maintain(&self, config: &Config) {
        if let Ok(storage_dir) = self.storage_dir(config) {
            super::reconcile::sweep_stale_staging(&storage_dir);
        }

        let migrated = match self.migrate_library_layout(config) {
            Ok(report) => report.migrated > 0 || !report.failed.is_empty(),
            Err(e) => {
                tracing::warn!("Failed to migrate the library layout: {}", e);
                // Whoever is waiting on an answer has to get one, or it waits
                // for the rest of the session.
                self.record_layout_migration(LayoutMigrationState::Idle);
                false
            }
        };

        let reconciled = match self.reconcile_index(config) {
            Ok(reconciled) => reconciled,
            Err(e) => {
                tracing::warn!("Failed to reconcile library on startup: {}", e);
                false
            }
        };

        if migrated || reconciled {
            self.events.emit(BackendEvent::LibraryChanged);
        }
    }
}
