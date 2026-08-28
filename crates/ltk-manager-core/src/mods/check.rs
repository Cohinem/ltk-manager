//! Mod health: what a check concluded about one library mod.
//!
//! The Problems engine speaks to a modder, in findings addressed to a property
//! inside a file. A mod user gets the same rules summarized to a verdict, per
//! "The verdict" in docs/ux/MOD_HEALTH.md. Verdicts are remembered in
//! `check-verdicts.json` beside the library index, so the library view can
//! badge every mod without re-scanning any.

use crate::config::Config;
use crate::error::{AppError, AppResult};
use crate::mods::ModLibrary;
use crate::mods::archive::install::STAGING_PREFIX;
use crate::mods::index::{LibraryModEntry, ModStorage};
use crate::problems::{self, Counts, Run};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;

/// Where the library remembers its verdicts, beside `library.json`.
const CHECK_VERDICTS_FILENAME: &str = "check-verdicts.json";

/// What one check concluded, summarized for a mod user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct ModCheckVerdict {
    pub mod_id: String,
    pub health: ModHealth,
    /// How many findings a repair would fix.
    pub fixable: u32,
    /// Every live finding by severity, fixable or not.
    pub counts: Counts,
    /// ISO-8601 timestamp the check ran.
    pub checked_at: String,
}

/// The one word a mod's badge says.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub enum ModHealth {
    /// Nothing a live rule objects to.
    Healthy,
    /// At least one finding a repair can fix.
    Repairable,
    /// Findings, and no fix for any of them.
    Unrepairable,
}

impl ModLibrary {
    /// Check one mod and remember the verdict.
    ///
    /// Runs the Problems rules over the mod's content — unpacking an
    /// archive-storage mod into staging to do it — without writing anything
    /// to the mod itself.
    ///
    /// # Errors
    ///
    /// Fails when the mod is not in the library, has faulted, or its content
    /// cannot be read.
    pub fn check_mod(&self, config: &Config, mod_id: &str) -> AppResult<ModCheckVerdict> {
        let storage_dir = self.storage_dir(config)?;
        let entry = self.with_index(config, |_storage_dir, index| {
            index
                .mods
                .iter()
                .find(|m| m.id == mod_id)
                .cloned()
                .ok_or_else(|| AppError::ModNotFound(mod_id.to_string()))
        })?;
        if entry.fault.is_some() {
            return Err(AppError::ValidationFailed(
                "This mod is in a failed state. Remove it and install it again.".to_string(),
            ));
        }

        let run = self.run_over(config, &storage_dir, &entry)?;
        self.record_check(&storage_dir, mod_id, &run)
    }

    /// Summarize `run` as `mod_id`'s verdict and remember it.
    ///
    /// The seam repair reaches through: it has already analyzed the mod, and
    /// the verdict rides along rather than costing a second scan.
    pub(in crate::mods) fn record_check(
        &self,
        storage_dir: &Path,
        mod_id: &str,
        run: &Run,
    ) -> AppResult<ModCheckVerdict> {
        let verdict = ModCheckVerdict::from_run(mod_id, run);
        let mut file = VerdictFile::load(storage_dir);
        file.verdicts.insert(mod_id.to_string(), verdict.clone());
        file.save(storage_dir)?;
        Ok(verdict)
    }

    /// Check each of `mod_ids`, and report how many verdicts were recorded.
    ///
    /// A mod that cannot be checked is logged and skipped, so one unreadable
    /// mod does not cost the caller the rest.
    pub fn check_mods(&self, config: &Config, mod_ids: &[String]) -> usize {
        let mut recorded = 0;
        for id in mod_ids {
            match self.check_mod(config, id) {
                Ok(_) => recorded += 1,
                Err(e) => tracing::warn!("Could not check mod {id}: {e}"),
            }
        }
        recorded
    }

    /// [`check_mods`](Self::check_mods) on a detached background thread,
    /// announcing once at the end so the UI refetches.
    ///
    /// For the install path: a newly imported mod is checked without asking,
    /// and thirty at once must not make the import wait.
    pub fn spawn_health_check(&self, config: &Config, mod_ids: Vec<String>) {
        if mod_ids.is_empty() {
            return;
        }

        let library = self.clone();
        let config = config.clone();
        std::thread::spawn(move || {
            if library.check_mods(&config, &mod_ids) > 0 {
                library
                    .events()
                    .emit(crate::events::BackendEvent::CheckVerdictsUpdated);
            }
        });
    }

    /// Every verdict the library remembers, by mod id.
    ///
    /// A mod never checked has no entry.
    ///
    /// # Errors
    ///
    /// Fails when no storage directory is configured.
    pub fn check_verdicts(&self, config: &Config) -> AppResult<BTreeMap<String, ModCheckVerdict>> {
        let storage_dir = self.storage_dir(config)?;
        Ok(VerdictFile::load(&storage_dir).verdicts)
    }

    /// One Problems run over the mod's content, whichever storage holds it.
    ///
    /// A Project-storage mod is read where it lives. An Archive-storage mod is
    /// unpacked into staging just to be read, and the staging is gone before
    /// this returns — a check never leaves anything behind.
    fn run_over(
        &self,
        config: &Config,
        storage_dir: &Path,
        entry: &LibraryModEntry,
    ) -> AppResult<Run> {
        match entry.storage {
            ModStorage::Project => problems::analyze(&entry.mod_dir(storage_dir), config),
            ModStorage::Archive => {
                let archive = entry.convertible_archive(storage_dir)?;
                let staging = storage_dir
                    .join("mods")
                    .join(format!("{STAGING_PREFIX}{}", Uuid::new_v4()));
                fs::create_dir_all(&staging)?;
                let run = self
                    .unpack_for_rules(&staging, &archive)
                    .and_then(|_| problems::analyze(&staging, config));
                let _ = fs::remove_dir_all(&staging);
                run
            }
        }
    }
}

impl ModCheckVerdict {
    /// Summarize one run the way a mod's badge reads it.
    fn from_run(mod_id: &str, run: &Run) -> Self {
        let counts = Counts::over(run.live_problems());
        let fixable = run
            .live_problems()
            .filter(|problem| problem.fix.is_some())
            .count() as u32;
        let total = counts.fatals + counts.errors + counts.warnings + counts.infos;

        let health = if total == 0 {
            ModHealth::Healthy
        } else if fixable > 0 {
            ModHealth::Repairable
        } else {
            ModHealth::Unrepairable
        };

        Self {
            mod_id: mod_id.to_string(),
            health,
            fixable,
            counts,
            checked_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// On-disk shape of `check-verdicts.json`.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerdictFile {
    version: u32,
    verdicts: BTreeMap<String, ModCheckVerdict>,
}

impl VerdictFile {
    /// Read the stored verdicts, starting empty when the file is missing or
    /// unreadable — a lost cache re-fills on the next check, and is not worth
    /// failing a read over.
    fn load(storage_dir: &Path) -> Self {
        let path = storage_dir.join(CHECK_VERDICTS_FILENAME);
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|e| {
                tracing::warn!("Unreadable {CHECK_VERDICTS_FILENAME}, starting over: {e}");
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    fn save(&self, storage_dir: &Path) -> AppResult<()> {
        let path = storage_dir.join(CHECK_VERDICTS_FILENAME);
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(self)?)?;
        fs::rename(&tmp, &path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
