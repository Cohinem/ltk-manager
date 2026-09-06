//! Copying installed mods back out of the library.
//!
//! An export is the reverse of [`install`](super::install): the archive that
//! arrived is still beside the mod, so writing it somewhere else is a copy and
//! never a repack. A mod whose archive is gone - a converted fantome that kept
//! no keepsake - has nothing to copy, and is reported rather than invented.

use fs_err::{self as fs, File};
use std::collections::HashSet;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::error::AppResult;
use crate::events::{BackendEvent, ExportProgress};
use crate::mods::ModLibrary;
use crate::mods::index::document::get_active_profile;

use super::metadata::read_installed_mod;

/// Which of the library's mods an export writes.
///
/// Every profile holds every mod, so the only scope narrower than the library
/// is what the active profile has switched on.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub enum ExportScope {
    /// What the active profile has on.
    Enabled,
    /// Every mod in the library.
    #[default]
    All,
}

/// What an export writes: loose archives, or one zip holding them.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub enum ExportShape {
    /// One archive per mod, into a directory.
    #[default]
    Folder,
    /// Every archive inside one `.zip` file.
    Zip,
}

/// What an export wrote, and what it had to leave behind.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    /// How many mods reached the destination.
    pub exported: usize,
    /// Mods with no archive to copy, named as the library names them.
    pub skipped: Vec<String>,
    /// What the export wrote, for a surface that offers to reveal it.
    pub destination: String,
}

/// One mod the export intends to write.
struct PlannedExport {
    name: String,
    archive: PathBuf,
}

impl ModLibrary {
    /// Write the mods `scope` selects to `destination`.
    ///
    /// `destination` is a directory for [`ExportShape::Folder`] and the `.zip`
    /// file itself for [`ExportShape::Zip`], and either is created if it is not
    /// there. A mod whose archive is missing lands in
    /// [`ExportSummary::skipped`] and the rest of the run continues.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::Io`](crate::error::AppError::Io) when the
    /// destination cannot be written, and with
    /// [`AppError::ZipError`](crate::error::AppError::ZipError) when the zip
    /// cannot be assembled. Either leaves what was already written in place.
    pub fn export_mods(
        &self,
        config: &Config,
        scope: ExportScope,
        shape: ExportShape,
        destination: &Path,
    ) -> AppResult<ExportSummary> {
        /* Planned under the index lock and copied outside it: reading every
        mod.config.json is the same cost as listing the library, and the copy
        itself is not something to hold the lock across. */
        let plan = self.plan_export(config, scope)?;

        let written = match shape {
            ExportShape::Folder => self.export_to_folder(&plan, destination),
            ExportShape::Zip => self.export_to_zip(&plan, destination),
        }?;

        Ok(written.into_summary(destination))
    }

    fn plan_export(&self, config: &Config, scope: ExportScope) -> AppResult<Vec<PlannedExport>> {
        self.with_index(config, |storage_dir, index| {
            let enabled: HashSet<&str> = get_active_profile(index)?
                .enabled_mods
                .iter()
                .map(String::as_str)
                .collect();

            let mut plan = Vec::new();
            for entry in &index.mods {
                if scope == ExportScope::Enabled && !enabled.contains(entry.id.as_str()) {
                    continue;
                }

                let name = read_installed_mod(entry, false, storage_dir, None)
                    .map(|installed| installed.display_name)
                    .unwrap_or_else(|_| entry.id.clone());

                plan.push(PlannedExport {
                    name,
                    archive: entry.archive_path(storage_dir),
                });
            }

            Ok(plan)
        })
    }

    fn export_to_folder(&self, plan: &[PlannedExport], destination: &Path) -> AppResult<Written> {
        fs::create_dir_all(destination)?;

        let mut written = Written::default();
        for (position, planned) in plan.iter().enumerate() {
            self.report_export(position, plan.len(), &planned.name);
            let Some(file_name) = archive_name(planned) else {
                written.skip(planned);
                continue;
            };
            fs::copy(&planned.archive, destination.join(file_name))?;
            written.exported += 1;
        }

        Ok(written)
    }

    fn export_to_zip(&self, plan: &[PlannedExport], destination: &Path) -> AppResult<Written> {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut zip = zip::ZipWriter::new(File::create(destination)?);
        /* Stored: a fantome and a modpkg are compressed already, so a second
        pass costs the whole library's read time and saves nothing. */
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .large_file(true);

        let mut written = Written::default();
        for (position, planned) in plan.iter().enumerate() {
            self.report_export(position, plan.len(), &planned.name);
            let Some(file_name) = archive_name(planned) else {
                written.skip(planned);
                continue;
            };
            zip.start_file(file_name, options)?;
            io::copy(&mut File::open(&planned.archive)?, &mut zip)?;
            written.exported += 1;
        }
        zip.finish()?;

        Ok(written)
    }

    fn report_export(&self, position: usize, total: usize, name: &str) {
        self.events()
            .emit(BackendEvent::ExportProgress(ExportProgress {
                current: position + 1,
                total,
                current_mod: name.to_string(),
            }));
    }
}

/// A mod's archive file name, or `None` when there is no archive to copy.
fn archive_name(planned: &PlannedExport) -> Option<String> {
    if !planned.archive.is_file() {
        return None;
    }
    planned
        .archive
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

/// The running tally both shapes keep.
#[derive(Default)]
struct Written {
    exported: usize,
    skipped: Vec<String>,
}

impl Written {
    fn skip(&mut self, planned: &PlannedExport) {
        tracing::warn!("No archive to export for {}", planned.archive.display());
        self.skipped.push(planned.name.clone());
    }

    fn into_summary(self, destination: &Path) -> ExportSummary {
        ExportSummary {
            exported: self.exported,
            skipped: self.skipped,
            destination: destination.to_string_lossy().into_owned(),
        }
    }
}

/// Suffix a `.zip` onto `destination` unless it already carries one.
///
/// The save dialog lets a user delete the extension it offered, and a zip
/// without one is a file Explorer refuses to open.
pub fn with_zip_extension(destination: &Path) -> PathBuf {
    match destination.extension() {
        Some(extension) if extension.eq_ignore_ascii_case("zip") => destination.to_path_buf(),
        _ => {
            let mut named = destination.as_os_str().to_os_string();
            named.push(".zip");
            PathBuf::from(named)
        }
    }
}

#[cfg(test)]
mod tests;
