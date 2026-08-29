//! Mod health: what a check concluded about one library mod.
//!
//! The Problems engine speaks to a modder, in findings addressed to a property
//! inside a file. A mod user gets the same rules summarized to a verdict, per
//! "The verdict" in docs/ux/MOD_HEALTH.md. Verdicts are remembered in
//! `mod-health-verdicts.json` beside the library index, so the library view can
//! badge every mod without re-scanning any.

pub mod sweep;
/* A dev-console measurement, and never in a release binary. */
#[cfg(debug_assertions)]
pub mod timing;

use crate::config::Config;
use crate::error::{AppError, AppResult, MutexResultExt};
use crate::mods::ModLibrary;
use crate::mods::archive::install::STAGING_PREFIX;
use crate::mods::index::{LibraryModEntry, ModStorage};
use crate::problems::{self, Budget, Counts, GameBuild, Run};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;

/// Where the library remembers its verdicts, beside `library.json`.
const MOD_HEALTH_VERDICTS_FILENAME: &str = "mod-health-verdicts.json";

/// What that file was called before this module was named for mod health.
pub(in crate::mods) const LEGACY_VERDICTS_FILENAME: &str = "check-verdicts.json";

/// What one check concluded, summarized for a mod user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct ModHealthVerdict {
    pub mod_id: String,
    pub health: ModHealth,
    /// How many findings a repair would fix.
    pub fixable: u32,
    /// Every live finding by severity, fixable or not.
    pub counts: Counts,
    /// The counts by rule, for a row a reader folds open.
    ///
    /// Defaulted for a verdict recorded before the field existed, which reads
    /// as a row with nothing to unfold until its next check.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rules: Vec<RuleBrief>,
    /// ISO-8601 timestamp the check ran.
    pub checked_at: String,
    /// What the check was a claim about, for the sweep to compare against.
    #[serde(default)]
    pub basis: HealthCheckBasis,
}

/// One rule's live findings, folded to what a mod user reads.
///
/// A rule title and its counts, never a site or a property path - that is the
/// modder's half, and it lives in the Problems panel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct RuleBrief {
    /// The rule's stable id, which the row quotes as a chip.
    pub rule: String,
    /// A few words naming the state the rule objects to.
    pub title: String,
    /// One sentence saying what that state is, which is the cause a reader
    /// gets - sites and property paths stay in the Problems panel.
    pub description: String,
    /// Live findings from this rule.
    pub count: u32,
    /// How many of them a repair would fix.
    pub fixable: u32,
    /// The type pairs the findings disagree on, distinct and in first-seen
    /// order. Where a rule reports types, `Expected File, found Hash` is the
    /// actual problem, and the row draws it in place of the description.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[cfg_attr(
        feature = "ts",
        ts(as = "Option<Vec<problems::TypeMismatch>>", optional)
    )]
    pub mismatches: Vec<problems::TypeMismatch>,
    /// Why the rest stay unrepaired, present only when some do.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(optional))]
    pub unfixable: Option<String>,
}

/// What a check ran against, and therefore what makes an old one stale.
///
/// Per "The basis" in docs/ux/MOD_HEALTH.md.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct HealthCheckBasis {
    /// The installed game build, absent where none could be read.
    #[cfg_attr(feature = "ts", ts(type = "string | null"))]
    pub build: Option<GameBuild>,
    /// The manager version, which is what a migration table ships in.
    pub manager: String,
}

impl LibraryModEntry {
    /// Whether the Problems rules can reach this mod's content at all.
    ///
    /// A modpkg's content only exists inside its archive, with no unpacked
    /// form to run the rules over - ADR-0001.
    pub(in crate::mods) fn is_checkable(&self) -> bool {
        self.format.is_convertible()
    }
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
    /// Fails when the mod is not in the library, or its content cannot be
    /// read.
    pub fn check_mod_health(&self, config: &Config, mod_id: &str) -> AppResult<ModHealthVerdict> {
        self.check_mod_health_within(config, mod_id, &Budget::repair())
    }

    /// [`check_mod_health`](Self::check_mod_health) under a caller's own budget.
    ///
    /// A run called off part way records no verdict at all, so the next sweep
    /// picks the mod up rather than trusting a check that did not finish.
    ///
    /// # Errors
    ///
    /// The same as [`check_mod_health`](Self::check_mod_health), plus a run
    /// that was cancelled before this mod was finished.
    pub(in crate::mods) fn check_mod_health_within(
        &self,
        config: &Config,
        mod_id: &str,
        budget: &Budget,
    ) -> AppResult<ModHealthVerdict> {
        let storage_dir = self.storage_dir(config)?;
        let entry = self.with_index(config, |_storage_dir, index| {
            index
                .mods
                .iter()
                .find(|m| m.id == mod_id)
                .cloned()
                .ok_or_else(|| AppError::ModNotFound(mod_id.to_string()))
        })?;

        let run = self.run_over(config, &storage_dir, &entry, budget)?;
        if budget.is_cancelled() {
            return Err(cancelled(mod_id));
        }
        self.record_health_check(config, &storage_dir, mod_id, &run)
    }

    /// Summarize `run` as `mod_id`'s verdict and remember it.
    ///
    /// The seam repair reaches through: it has already analyzed the mod, and
    /// the verdict rides along rather than costing a second scan.
    pub(in crate::mods) fn record_health_check(
        &self,
        config: &Config,
        storage_dir: &Path,
        mod_id: &str,
        run: &Run,
    ) -> AppResult<ModHealthVerdict> {
        let verdict = ModHealthVerdict::from_run(mod_id, run, self.health_check_basis(config));
        let _lock = self.verdict_lock().lock().mutex_err()?;
        let mut file = VerdictFile::load(storage_dir);
        file.verdicts.insert(mod_id.to_string(), verdict.clone());
        file.save(storage_dir)?;
        Ok(verdict)
    }

    /// Forget `mod_id`'s verdict, so the next sweep owes it a check.
    ///
    /// What a run that wrote to a mod and was then called off leaves behind: the
    /// stored verdict describes content that has since changed, and the sweep
    /// compares only the basis, so a stale verdict would otherwise stand until
    /// the game patches.
    pub(in crate::mods) fn forget_health_check(&self, storage_dir: &Path, mod_id: &str) {
        let Ok(_lock) = self.verdict_lock().lock() else {
            return;
        };
        let mut file = VerdictFile::load(storage_dir);
        if file.verdicts.remove(mod_id).is_none() {
            return;
        }
        if let Err(e) = file.save(storage_dir) {
            tracing::warn!("Could not drop the stale verdict of {mod_id}: {e}");
        }
    }

    /// What a check running now would be a claim about.
    pub(in crate::mods) fn health_check_basis(&self, config: &Config) -> HealthCheckBasis {
        HealthCheckBasis {
            build: GameBuild::installed(config),
            manager: self.app_version().to_owned(),
        }
    }

    /// Check each of `mod_ids`, and report how many verdicts were recorded.
    ///
    /// A mod that cannot be checked is logged and skipped, so one unreadable
    /// mod does not cost the caller the rest.
    pub fn check_mods_health(&self, config: &Config, mod_ids: &[String]) -> usize {
        let mut recorded = 0;
        for id in mod_ids {
            match self.check_mod_health(config, id) {
                Ok(_) => recorded += 1,
                Err(e) => tracing::warn!("Could not check mod {id}: {e}"),
            }
        }
        recorded
    }

    /// [`check_mods_health`](Self::check_mods_health) on a detached background
    /// thread, announcing once at the end so the UI refetches.
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
            if library.check_mods_health(&config, &mod_ids) > 0 {
                library
                    .events()
                    .emit(crate::events::BackendEvent::ModHealthVerdictsUpdated);
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
    pub fn mod_health_verdicts(
        &self,
        config: &Config,
    ) -> AppResult<BTreeMap<String, ModHealthVerdict>> {
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
        budget: &Budget,
    ) -> AppResult<Run> {
        match entry.storage {
            ModStorage::Project => {
                problems::analyze_within(&entry.mod_dir(storage_dir), config, budget.clone())
            }
            ModStorage::Archive => {
                let archive = entry.convertible_archive(storage_dir)?;
                let staging = storage_dir
                    .join("mods")
                    .join(format!("{STAGING_PREFIX}{}", Uuid::new_v4()));
                fs::create_dir_all(&staging)?;
                let run = self
                    .unpack_for_rules(&staging, &archive)
                    .and_then(|_| problems::analyze_within(&staging, config, budget.clone()));
                let _ = fs::remove_dir_all(&staging);
                run
            }
        }
    }
}

impl ModHealthVerdict {
    /// Summarize one run the way a mod's badge reads it.
    fn from_run(mod_id: &str, run: &Run, basis: HealthCheckBasis) -> Self {
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
            rules: rule_briefs(run),
            checked_at: chrono::Utc::now().to_rfc3339(),
            basis,
        }
    }
}

impl RuleBrief {
    /// One rule's counts under the sentences `info` words it with.
    ///
    /// The words always come from the build rather than from any record: the
    /// store keeps counts alone, so a sentence a build rewrites - or one day
    /// localizes - reads correctly out of every remembered verdict.
    fn worded(
        info: &problems::RuleInfo,
        count: u32,
        fixable: u32,
        mismatches: Vec<problems::TypeMismatch>,
    ) -> Self {
        Self {
            rule: info.id.to_string(),
            title: info.title.clone(),
            description: info.description.clone(),
            count,
            fixable,
            mismatches,
            unfixable: (fixable < count && !info.unfixable.is_empty())
                .then(|| info.unfixable.clone()),
        }
    }
}

/// Fold a run's live findings by rule, in the order the run names its rules.
fn rule_briefs(run: &Run) -> Vec<RuleBrief> {
    run.rules
        .iter()
        .filter_map(|rule| {
            let mut count = 0u32;
            let mut fixable = 0u32;
            let mut mismatches = Vec::new();
            for problem in run.live_problems().filter(|p| p.rule == rule.id) {
                count += 1;
                if problem.fix.is_some() {
                    fixable += 1;
                }
                if let Some(mismatch) = &problem.mismatch
                    && !mismatches.contains(mismatch)
                {
                    mismatches.push(mismatch.clone());
                }
            }
            (count > 0).then(|| RuleBrief::worded(rule, count, fixable, mismatches))
        })
        .collect()
}

/// The error a mod the run never finished reports.
///
/// Its own sentence rather than a silent skip: a caller counting what it asked
/// for has to be able to tell a mod that was called off from one that failed.
pub(in crate::mods) fn cancelled(mod_id: &str) -> AppError {
    AppError::ValidationFailed(format!("The run was cancelled before {mod_id} finished"))
}

/// The stored shape's version, bumped when a brief gains data an old record
/// never wrote - the type pairs, at 1.
///
/// A file from an older shape is discarded on load rather than carried: its
/// verdicts read as never checked, so the next sweep re-checks those mods and
/// records what the old shape was missing. Sentences never force a bump,
/// because the store holds none.
const VERDICT_FILE_VERSION: u32 = 1;

/// The remembered verdicts, as every reader and writer holds them.
///
/// Not the on-disk shape: that is [`StoredVerdictFile`], which keeps data
/// alone. Loading is where the two meet, so a brief's sentences are always
/// the running build's.
#[derive(Debug, Default)]
struct VerdictFile {
    verdicts: BTreeMap<String, ModHealthVerdict>,
}

/// On-disk shape of `mod-health-verdicts.json`.
///
/// A brief is persisted as its data alone - the rule id and the counts - and
/// its sentences are reconstructed on load from the rules as this build words
/// them. Persisted words go stale the moment a build rewrites them, because
/// the sweep re-checks only when the basis moves, and words the store never
/// holds are also words a later build can localize.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredVerdictFile {
    version: u32,
    verdicts: BTreeMap<String, StoredVerdict>,
}

/// One verdict as the file keeps it: [`ModHealthVerdict`] minus the words.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredVerdict {
    mod_id: String,
    health: ModHealth,
    fixable: u32,
    counts: Counts,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    rules: Vec<StoredRuleBrief>,
    checked_at: String,
    #[serde(default)]
    basis: HealthCheckBasis,
}

/// One brief as the file keeps it: the rule id, the counts, and the type
/// pairs - all data, no sentences.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredRuleBrief {
    rule: String,
    count: u32,
    fixable: u32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    mismatches: Vec<problems::TypeMismatch>,
}

impl StoredVerdict {
    /// The verdict without its sentences, ready to persist.
    fn strip(verdict: &ModHealthVerdict) -> Self {
        Self {
            mod_id: verdict.mod_id.clone(),
            health: verdict.health,
            fixable: verdict.fixable,
            counts: verdict.counts,
            rules: verdict
                .rules
                .iter()
                .map(|brief| StoredRuleBrief {
                    rule: brief.rule.clone(),
                    count: brief.count,
                    fixable: brief.fixable,
                    mismatches: brief.mismatches.clone(),
                })
                .collect(),
            checked_at: verdict.checked_at.clone(),
            basis: verdict.basis.clone(),
        }
    }

    /// The verdict under the sentences `rules` word its briefs with.
    ///
    /// A brief whose rule this build no longer ships keeps its counts and
    /// wears its rule id for a title, because the data outlives the words.
    fn worded(self, rules: &[problems::RuleInfo]) -> ModHealthVerdict {
        let briefs = self
            .rules
            .into_iter()
            .map(
                |brief| match rules.iter().find(|info| info.id.to_string() == brief.rule) {
                    Some(info) => {
                        RuleBrief::worded(info, brief.count, brief.fixable, brief.mismatches)
                    }
                    None => RuleBrief {
                        title: brief.rule.clone(),
                        description: String::new(),
                        rule: brief.rule,
                        count: brief.count,
                        fixable: brief.fixable,
                        mismatches: brief.mismatches,
                        unfixable: None,
                    },
                },
            )
            .collect();
        ModHealthVerdict {
            mod_id: self.mod_id,
            health: self.health,
            fixable: self.fixable,
            counts: self.counts,
            rules: briefs,
            checked_at: self.checked_at,
            basis: self.basis,
        }
    }
}

impl VerdictFile {
    /// Read the stored verdicts, starting empty when the file is missing or
    /// unreadable — a lost cache re-fills on the next check, and is not worth
    /// failing a read over.
    fn load(storage_dir: &Path) -> Self {
        let path = storage_dir.join(MOD_HEALTH_VERDICTS_FILENAME);
        let stored: StoredVerdictFile = match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|e| {
                tracing::warn!("Unreadable {MOD_HEALTH_VERDICTS_FILENAME}, starting over: {e}");
                StoredVerdictFile::default()
            }),
            Err(_) => StoredVerdictFile::default(),
        };
        if stored.version < VERDICT_FILE_VERSION && !stored.verdicts.is_empty() {
            tracing::info!(
                "Discarding {} verdicts from shape {} of {MOD_HEALTH_VERDICTS_FILENAME}: the next sweep re-checks them",
                stored.verdicts.len(),
                stored.version
            );
            return Self::default();
        }

        let rules: Vec<problems::RuleInfo> = problems::rules::all()
            .iter()
            .map(|rule| rule.info())
            .collect();
        Self {
            verdicts: stored
                .verdicts
                .into_iter()
                .map(|(mod_id, verdict)| (mod_id, verdict.worded(&rules)))
                .collect(),
        }
    }

    fn save(&self, storage_dir: &Path) -> AppResult<()> {
        let stored = StoredVerdictFile {
            version: VERDICT_FILE_VERSION,
            verdicts: self
                .verdicts
                .iter()
                .map(|(mod_id, verdict)| (mod_id.clone(), StoredVerdict::strip(verdict)))
                .collect(),
        };
        let path = storage_dir.join(MOD_HEALTH_VERDICTS_FILENAME);
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(&stored)?)?;
        fs::rename(&tmp, &path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
