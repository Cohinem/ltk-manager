//! What a repair changed, as the edit the archive it came out of takes.
//!
//! A fix run rewrites a handful of files in an archive that runs to hundreds of
//! megabytes. Stated as an [`ArchiveDelta`], those files are the
//! [`apply_delta`] writes and removals and everything else is raw-copied, where
//! packing the staged project again re-encodes every chunk the mod holds.

use crate::error::{AppError, AppResult, Utf8PathRefExt};
use crate::problems::{FileChange, FileOutcome, FixReport, HeldWrites, KeptTable};
use camino::Utf8Path;
use fs_err as fs;
use ltk_fantome::{ArchiveDelta, DeltaReport, FantomeHashtable, FantomeReader, apply_delta};
use ltk_hashtable::Category;
use ltk_mod_project::{HASHES_DIR_NAME, ModProject, ModProjectLayer};
use ltk_wad::{WadHash, chunk_hash_of};
use std::path::{Path, PathBuf};

/// The suffix a base-layer directory takes to be one of the mod's WADs.
const WAD_DIR_SUFFIX: &str = ".wad.client";

/// Where an unpack writes the archive's `RAW/` entries, under the base layer.
const RAW_DIR: &str = "raw";

/// Where an archive keeps the hashtable files its metadata declares.
const ARCHIVE_HASHES_DIR: &str = "META/hashes";

/// The entry an archive's own metadata travels in.
const ARCHIVE_INFO: &str = "META/info.json";

/// What a repair changed, ready to write into the archive it came out of.
#[derive(Debug)]
pub(super) struct RepairEdit(ArchiveDelta<'static>);

impl RepairEdit {
    /// Read what `report` applied out of the repaired tree at `staging`.
    ///
    /// [`FixRun::write`](crate::problems::FixRun::write) keeps none of the bytes
    /// it writes, so every fixed file is read back here - a few KB apiece,
    /// against a repack of everything the mod holds. `archive` is read for the
    /// metadata a kept name has to be declared in, and is not written to.
    ///
    /// # Errors
    ///
    /// Reports a repaired file or the archive's metadata that could not be
    /// read, and a fix the Fantome format has no place for. Either leaves the
    /// repack as the way to write the repair.
    pub(super) fn read(staging: &Path, archive: &Utf8Path, report: &FixReport) -> AppResult<Self> {
        let mut delta = assemble(report, |file| {
            Ok(fs::read(content_path(staging, &file.layer, &file.path))?)
        })?;

        if report.names_kept > 0 {
            declare_kept_names(&mut delta, staging, archive)?;
        }

        Ok(Self(delta))
    }

    /// Read what `report` applied out of `held`, a run that wrote nothing to
    /// disk.
    ///
    /// The bytes are the run's own, so nothing is read back, and the kept
    /// names arrive as the one merged table rather than as a project's
    /// `hashes/`. `archive` is read for the metadata that table has to be
    /// declared in, and is not written to.
    ///
    /// # Errors
    ///
    /// Reports a fix the Fantome format has no place for, and a file the run
    /// reports written but holds no bytes for. Either leaves the unpack and
    /// the repack as the way to write the repair.
    pub(super) fn held(
        held: &HeldWrites,
        archive: &Utf8Path,
        report: &FixReport,
    ) -> AppResult<Self> {
        let mut delta = assemble(report, |file| {
            held.bytes(&file.layer, &file.path)
                .map(<[u8]>::to_vec)
                .ok_or_else(|| {
                    AppError::Other(format!(
                        "The run holds no bytes for {}/{}",
                        file.layer, file.path
                    ))
                })
        })?;

        if let Some(table) = held.table() {
            declare_held_table(&mut delta, table, archive)?;
        }

        Ok(Self(delta))
    }

    /// Write the edit over `archive`.
    ///
    /// # Errors
    ///
    /// Reports an archive `ltk_fantome` will not edit - most often one shipping
    /// its WADs as loose files, which have no packed bytes to rebase. Nothing
    /// is written to `archive` on a refusal.
    pub(super) fn apply(&self, archive: &Utf8Path) -> AppResult<DeltaReport> {
        apply_delta(archive, archive, &self.0, None)
            .map_err(|e| AppError::Other(format!("Failed to edit {archive}: {e}")))
    }
}

/// The delta `report` states, with `bytes_of` answering for each written file.
///
/// # Errors
///
/// Reports a fix the Fantome format has no place for, and whatever `bytes_of`
/// reports.
fn assemble(
    report: &FixReport,
    bytes_of: impl Fn(&FileOutcome) -> AppResult<Vec<u8>>,
) -> AppResult<ArchiveDelta<'static>> {
    let mut delta = ArchiveDelta::new();

    for file in &report.files {
        // A file a rule read and left alone was never written, so its bytes
        // are the archive's own and re-encoding them would change the mod.
        if file.applied == 0 {
            continue;
        }

        let target = DeltaTarget::of(&file.layer, &file.path).ok_or_else(|| {
            AppError::Other(format!(
                "A Fantome archive has no place for {}/{}",
                file.layer, file.path
            ))
        })?;

        match file.change {
            FileChange::Removed => match target {
                DeltaTarget::Chunk { wad, hash } => delta.remove_chunk(&wad, hash),
                DeltaTarget::Entry { path } => delta.remove_entry(&path),
            },
            FileChange::Written => {
                let bytes = bytes_of(file)?;
                match target {
                    DeltaTarget::Chunk { wad, hash } => delta.chunk(&wad, hash, bytes),
                    DeltaTarget::Entry { path } => delta.entry(&path, bytes),
                }
            }
        };
    }

    Ok(delta)
}

/// What one repaired file of a staged project is, to the archive it came out
/// of.
#[derive(Debug, Clone, PartialEq, Eq)]
enum DeltaTarget {
    /// A chunk of a packed WAD, keyed the way that WAD keys it.
    Chunk { wad: String, hash: WadHash },
    /// A whole archive entry, at the path the archive names it by.
    Entry { path: String },
}

impl DeltaTarget {
    /// What the repaired `path` of `layer` addresses.
    ///
    /// The unpack's own placement read backwards: `WAD/` lands in the base
    /// layer and `RAW/` under its `raw` directory, so a `.wad.client` directory
    /// is a WAD addressing its chunks by hash and everything else is an entry
    /// at its own path.
    ///
    /// The hash comes from [`chunk_hash_of`] rather than from the path's own
    /// spelling, because a lossless unpack writes a nameless chunk as bare hex
    /// and adds `.ltk` to a path two chunks claimed.
    ///
    /// `None` for a layer Fantome has no place for: it stores the base layer
    /// alone, and there is nowhere else for the file to go.
    fn of(layer: &str, path: &str) -> Option<Self> {
        if layer != ModProjectLayer::BASE_NAME {
            return None;
        }

        Some(match path.split_once('/') {
            Some((dir, rest)) if dir.to_ascii_lowercase().ends_with(WAD_DIR_SUFFIX) => {
                Self::Chunk {
                    wad: dir.to_owned(),
                    hash: chunk_hash_of(Utf8Path::new(rest)),
                }
            }
            Some((RAW_DIR, rest)) => Self::Entry {
                path: format!("RAW/{rest}"),
            },
            _ => Self::Entry {
                path: format!("WAD/{path}"),
            },
        })
    }
}

/// Carry the mod's own hashtables into the edit, and declare them.
///
/// A repair writes every path it hashes into the mod's own table instead of
/// keeping a restore point - ADR-0006 - so an edit naming only the fixed files
/// would leave the mod holding hashes nothing reads back. Every declared table
/// travels rather than only the one this run merged into, since which of them
/// that was is the fix run's to know and a mod's tables are its own file names.
fn declare_kept_names(
    delta: &mut ArchiveDelta<'static>,
    staging: &Path,
    archive: &Utf8Path,
) -> AppResult<()> {
    let root = staging.try_as_utf8("staging directory")?;
    let project = ModProject::load(root)
        .map_err(|e| AppError::Other(format!("Could not read the repaired mod project: {e}")))?;

    let mut info = FantomeReader::new(fs::File::open(archive)?)
        .and_then(|mut reader| reader.read_info())
        .map_err(|e| AppError::Other(format!("Could not read {archive}'s metadata: {e}")))?;

    let declared = info.hashtables.len();
    for manifest in &project.hashtables {
        let path = archive_table_path(&manifest.path).ok_or_else(|| {
            AppError::Other(format!(
                "A Fantome archive has no place for {}",
                manifest.path
            ))
        })?;

        delta.entry(&path, fs::read(root.join(&manifest.path))?);
        if !info
            .hashtables
            .iter()
            .any(|held| held.path.eq_ignore_ascii_case(&path))
        {
            info.hashtables.push(FantomeHashtable {
                path,
                category: manifest.category.clone(),
                algorithm: manifest.algorithm.clone(),
                bits: manifest.bits,
            });
        }
    }

    if info.hashtables.len() != declared {
        let written = serde_json::to_vec_pretty(&info)
            .map_err(|e| AppError::Other(format!("Could not write {archive}'s metadata: {e}")))?;
        delta.entry(ARCHIVE_INFO, written);
    }

    Ok(())
}

/// Carry the merged table into the edit, and declare it where the archive
/// does not.
///
/// One table rather than every declared one: a held run merges into the table
/// it names, and the rest are the archive's own bytes, which the edit
/// raw-copies.
fn declare_held_table(
    delta: &mut ArchiveDelta<'static>,
    table: &KeptTable,
    archive: &Utf8Path,
) -> AppResult<()> {
    let mut info = FantomeReader::new(fs::File::open(archive)?)
        .and_then(|mut reader| reader.read_info())
        .map_err(|e| AppError::Other(format!("Could not read {archive}'s metadata: {e}")))?;

    let path = match &table.into {
        Some(entry) => entry.path().to_string(),
        None => free_archive_table_path(&info.hashtables),
    };
    delta.entry(&path, table.bytes.clone());

    if !info
        .hashtables
        .iter()
        .any(|held| held.path.eq_ignore_ascii_case(&path))
    {
        let (algorithm, width) = &table.shape;
        info.hashtables.push(FantomeHashtable {
            path,
            category: Category::Game,
            algorithm: algorithm.clone(),
            bits: width.bits(),
        });
        let written = serde_json::to_vec_pretty(&info)
            .map_err(|e| AppError::Other(format!("Could not write {archive}'s metadata: {e}")))?;
        delta.entry(ARCHIVE_INFO, written);
    }

    Ok(())
}

/// A conventional table path under the archive's `META/hashes/` that no
/// manifest entry has claimed.
///
/// The same sequence a project's `hashes/` is named by, under the archive's
/// own directory.
fn free_archive_table_path(manifests: &[FantomeHashtable]) -> String {
    let taken: Vec<String> = manifests
        .iter()
        .map(|manifest| manifest.path.to_ascii_lowercase())
        .collect();
    std::iter::once(format!("{ARCHIVE_HASHES_DIR}/game.hashes.txt"))
        .chain(
            (1..).map(|attempt| format!("{ARCHIVE_HASHES_DIR}/game.repaired{attempt}.hashes.txt")),
        )
        .find(|candidate| !taken.contains(&candidate.to_ascii_lowercase()))
        .expect("the candidate sequence is unbounded")
}

/// Where the archive keeps the table a project declares at `declared`.
///
/// `None` for anything but a plain name directly under `hashes/`. A pack routes
/// those too, by rules `ltk_mod_project` owns and this would be a second copy
/// of, so an edit hands them back to the repack rather than guessing.
fn archive_table_path(declared: &str) -> Option<String> {
    let name = declared
        .strip_prefix(HASHES_DIR_NAME)
        .and_then(|rest| rest.strip_prefix('/'))
        .filter(|name| !name.is_empty() && !name.contains(['/', '\\', ':']))?;
    Some(format!("{ARCHIVE_HASHES_DIR}/{name}"))
}

/// Where `layer`'s file `path` sits under a staged project.
fn content_path(staging: &Path, layer: &str, path: &str) -> PathBuf {
    staging
        .join("content")
        .join(layer)
        .join(path.replace('/', std::path::MAIN_SEPARATOR_STR))
}

#[cfg(test)]
mod tests;
