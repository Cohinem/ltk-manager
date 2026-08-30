//! One pass of every rule over one project.
//!
//! A run lists each layer's files, hands them to each rule and collects what
//! the rules report. A rule that throws does not take the run with it: a
//! project with one unreadable `.bin` still gets every problem in the other
//! forty, and the panel names the file it could not read.
//!
//! Where those files are is [`LayerFiles`]'s business alone. A project's are a
//! directory, and an archive's are the archive - read where it lies, never
//! unpacked. Everything above [`BinHandle::read`] is written once for both.

mod archive;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use chrono::Utc;
use ltk_file::LeagueFileKind;
use ltk_wad::{PathResolver, WadHash, is_hex_chunk_path};
use walkdir::WalkDir;

use crate::config::Config;
use crate::error::AppResult;
use crate::workshop::layer;
use crate::workshop::{ProjectDir, WorkshopFileKind};

use archive::ArchiveFiles;

use super::budget::Budget;
use super::{BinNames, GameBuild, ObjectInfo, Report, RuleState, Run};

/// The directory a project keeps its layers under.
const CONTENT_DIR: &str = "content";

/// The files of one project, and what else a run hands every rule.
///
/// Built once for a run and shared by every rule, because listing the content
/// is the one cost worth paying exactly once. Reading a file's bytes is each
/// rule's own business.
///
/// The installed build and the hash tables ride here too. A rule needs all
/// three to decide what it has to say, and each of them costs the same
/// whichever rule reads it.
#[derive(Debug)]
pub struct ProjectFiles {
    root: PathBuf,
    layers: Vec<LayerFiles>,
    build: Option<GameBuild>,
    names: BinNames,
    budget: Budget,
}

impl ProjectFiles {
    /// Walk `project_root`'s content directory, in every layer.
    ///
    /// # Errors
    ///
    /// Reports a project whose `content/` directory cannot be read at all. An
    /// unreadable file inside it is skipped and logged, never fatal.
    pub fn read(project_root: &Path, config: &Config) -> AppResult<Self> {
        Self::within(project_root, config, Budget::repair())
    }

    /// [`read`](Self::read) under a caller's own budget.
    ///
    /// # Errors
    ///
    /// The same as [`read`](Self::read).
    pub fn within(project_root: &Path, config: &Config, budget: Budget) -> AppResult<Self> {
        let content_dir = project_root.join(CONTENT_DIR);
        let layers = if content_dir.exists() {
            layer::dirs_in(&content_dir)?
                .iter()
                .map(|dir| {
                    let name = dir
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default();
                    LayerFiles::read(dir, name)
                })
                .collect()
        } else {
            Vec::new()
        };

        Ok(Self {
            root: project_root.to_path_buf(),
            layers,
            build: GameBuild::installed(config),
            names: BinNames::open(project_root),
            budget,
        })
    }

    /// List a fantome archive's files, reading them where the archive keeps
    /// them.
    ///
    /// The archive is never unpacked. A packed WAD is read chunk by chunk and
    /// a WAD kept as a directory of entries entry by entry, so a check costs
    /// the bins it parses rather than the tree an unpack would have written.
    ///
    /// `resolver` names a packed WAD's chunks, the same resolver an unpack
    /// would have named them with, so a site addresses the same path either
    /// way. The archive's own declared tables are read from inside it, which
    /// is where a project keeps them under `hashes/`.
    ///
    /// # Errors
    ///
    /// Reports an archive that cannot be opened or whose entry table cannot be
    /// read. A single WAD that will not mount is logged and skipped.
    pub fn in_archive(
        archive: &Path,
        config: &Config,
        budget: Budget,
        resolver: &dyn PathResolver,
    ) -> AppResult<Self> {
        let scan = ArchiveFiles::scan(archive, resolver)?;

        Ok(Self {
            root: archive.to_path_buf(),
            layers: vec![scan.layer],
            build: GameBuild::installed(config),
            names: BinNames::with_declared(scan.tables),
            budget,
        })
    }

    /// Where the content was read from: a project's directory, or an archive.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The layers, in the order the content directory lists them.
    #[must_use]
    pub fn layers(&self) -> &[LayerFiles] {
        &self.layers
    }

    /// The installed game's content build, where one could be read.
    #[must_use]
    pub fn build(&self) -> Option<GameBuild> {
        self.build
    }

    /// The names a row can give the hashes a bin holds.
    #[must_use]
    pub fn names(&self) -> &BinNames {
        &self.names
    }

    /// The memory this run may hold parsed at once, and its cancel flag.
    ///
    /// A rule fans its own files out through this rather than over a pool of
    /// its own, so every rule of every mod in flight spends one allowance.
    #[must_use]
    pub fn budget(&self) -> &Budget {
        &self.budget
    }

    /// Every file of every layer that reports `kind`.
    pub fn by_kind(
        &self,
        kind: WorkshopFileKind,
    ) -> impl Iterator<Item = (&LayerFiles, &ProjectFile)> {
        self.layers.iter().flat_map(move |layer| {
            layer
                .files
                .iter()
                .filter(move |file| file.kind == kind)
                .map(move |file| (layer, file))
        })
    }

    /// Every property bin of every layer, override bins included.
    ///
    /// The seam a bin rule reads through: it names the files and hands back a
    /// handle rather than the bytes, so the day `ltk_meta` can read a bin
    /// lazily, [`BinHandle::read`] is the only thing that changes.
    pub fn bins(&self) -> impl Iterator<Item = BinHandle<'_>> {
        self.by_kind(WorkshopFileKind::PropertyBin)
            .chain(self.by_kind(WorkshopFileKind::PropertyBinOverride))
            .map(|(layer, file)| BinHandle { layer, file })
    }

    /// How many files the whole project holds.
    fn file_count(&self) -> usize {
        self.layers.iter().map(|layer| layer.files.len()).sum()
    }
}

/// The files of one layer, and where to read one.
#[derive(Debug, Clone)]
pub struct LayerFiles {
    /// The layer's own name, such as `base`.
    pub name: String,
    pub files: Vec<ProjectFile>,
    source: LayerSource,
}

/// Where a layer's files are.
///
/// The seam between "which files a run sees" and "what a file's bytes are".
/// Everything above it - the rules, the sites they report, the budget they
/// spend - is written once and reads both.
#[derive(Debug, Clone)]
enum LayerSource {
    /// A directory on disk, holding each file at its own path under this root.
    Directory(PathBuf),
    /// A fantome archive, shared by every handle that reads out of it.
    Archive(Arc<ArchiveFiles>),
}

impl LayerSource {
    /// The bytes of one of the layer's files.
    fn read(&self, file: &ProjectFile) -> Result<Vec<u8>, String> {
        match self {
            Self::Directory(root) => std::fs::read(absolute(root, file)).map_err(|e| e.to_string()),
            Self::Archive(archive) => archive.read(file),
        }
    }
}

/// Where `file` sits under a directory layer's `root`.
fn absolute(root: &Path, file: &ProjectFile) -> PathBuf {
    root.join(file.path.replace('/', std::path::MAIN_SEPARATOR_STR))
}

/// What one file of a tree is, by its extension or by its first bytes.
///
/// An extension is what names a file, so it decides wherever there is one to
/// read. The exception is the bare hex an unpack writes a chunk as when nothing
/// named it: that name says only which chunk, never what, so the file is opened
/// for the eight bytes that do say - a bin the tables could not name is still a
/// bin the rules have to read.
///
/// `at` is where the file is, and `relative` the path a site names it by.
fn kind_in_tree(at: &Path, relative: &str) -> WorkshopFileKind {
    let extension = at.extension().and_then(|extension| extension.to_str());
    let named = LeagueFileKind::from_extension(extension.unwrap_or_default());
    if named != LeagueFileKind::Unknown || !is_hex_chunk_path(camino::Utf8Path::new(relative)) {
        return WorkshopFileKind::from(named);
    }

    let sniffed = std::fs::File::open(at)
        .and_then(|mut file| LeagueFileKind::identify_from_reader(&mut file))
        .unwrap_or_else(|e| {
            tracing::debug!("Could not read the first bytes of {}: {e}", at.display());
            LeagueFileKind::Unknown
        });
    WorkshopFileKind::from(sniffed)
}

impl LayerFiles {
    /// Walk one layer's content directory, recursively.
    ///
    /// An entry the walk cannot read is logged and skipped, because one
    /// unreadable directory is no reason to report nothing about the rest.
    fn read(dir: &Path, name: &str) -> Self {
        let walk = WalkDir::new(dir)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| {
                // The walk starts at the layer root, whose basename is out of
                // the project's hands - a temp directory may begin with a dot.
                entry.depth() == 0
                    || entry
                        .file_name()
                        .to_str()
                        .is_some_and(|name| !name.starts_with('.'))
            });

        let mut files = Vec::new();
        for entry in walk {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    tracing::warn!("Skipping unreadable entry in {}: {e}", dir.display());
                    continue;
                }
            };

            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry
                .path()
                .strip_prefix(dir)
                .unwrap_or_else(|_| entry.path())
                .components()
                .filter_map(|part| part.as_os_str().to_str())
                .collect::<Vec<_>>()
                .join("/");

            files.push(ProjectFile {
                kind: kind_in_tree(entry.path(), &path),
                path,
                size_bytes: entry.metadata().map(|meta| meta.len()).unwrap_or(0),
                chunk: None,
            });
        }

        files.sort_by(|a, b| a.path.cmp(&b.path));

        Self {
            name: name.to_owned(),
            files,
            source: LayerSource::Directory(dir.to_path_buf()),
        }
    }

    /// The layer an archive holds, reading back through `source`.
    fn in_archive(name: &str, files: Vec<ProjectFile>, source: ArchiveFiles) -> Self {
        Self {
            name: name.to_owned(),
            files,
            source: LayerSource::Archive(Arc::new(source)),
        }
    }

    /// Where one of this layer's files is on disk, for a layer on disk.
    ///
    /// `None` for a layer read out of an archive, whose files have no path of
    /// their own - which is what [`BinHandle::read`] exists to spare a rule
    /// having to know.
    #[must_use]
    pub fn absolute(&self, file: &ProjectFile) -> Option<PathBuf> {
        match &self.source {
            LayerSource::Directory(root) => Some(absolute(root, file)),
            LayerSource::Archive(_) => None,
        }
    }
}

/// One property bin of one layer, not yet read.
///
/// Names where the bin is and opens it on demand. A rule holds one per file and
/// parses at most once, which is what keeps a check and the repair that follows
/// it to a single read.
#[derive(Debug, Clone, Copy)]
pub struct BinHandle<'a> {
    layer: &'a LayerFiles,
    file: &'a ProjectFile,
}

impl<'a> BinHandle<'a> {
    /// The layer this bin sits in, such as `base`.
    #[must_use]
    pub fn layer(&self) -> &'a str {
        &self.layer.name
    }

    /// The bin's path, POSIX-style and relative to the layer root.
    #[must_use]
    pub fn path(&self) -> &'a str {
        &self.file.path
    }

    /// The bin's size on disk, which is what a budget is spent in.
    #[must_use]
    pub fn size_bytes(&self) -> u64 {
        self.file.size_bytes
    }

    /// Where the bin sits on disk, where it sits on disk at all.
    ///
    /// See [`LayerFiles::absolute`] for the `None`.
    #[must_use]
    pub fn absolute(&self) -> Option<PathBuf> {
        self.layer.absolute(self.file)
    }

    /// Parse the bin.
    ///
    /// # Errors
    ///
    /// Reports the file it could not open or parse, as one sentence a panel
    /// can draw.
    pub fn read(&self) -> Result<ltk_meta::Bin, String> {
        let bytes = self.layer.source.read(self.file)?;
        ltk_meta::Bin::from_reader(&mut std::io::Cursor::new(&bytes)).map_err(|e| e.to_string())
    }
}

/// One file of one layer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectFile {
    /// Relative to the layer root, always POSIX-style.
    pub path: String,
    pub kind: WorkshopFileKind,
    pub size_bytes: u64,
    /// The chunk of a packed WAD this file is, where that is where it lives.
    ///
    /// A chunk is addressed by hash, and its path is only what a hashtable
    /// made of that hash - so the hash cannot be read back out of the path,
    /// and a chunk no table names has no path to read it out of at all.
    pub chunk: Option<WadHash>,
}

/// Run every rule over one project.
///
/// # Errors
///
/// Reports a project that cannot be opened or whose content directory cannot
/// be read. A rule that fails is recorded in [`Run::failed`] rather than
/// failing the run.
pub fn analyze(project_root: &Path, config: &Config) -> AppResult<Run> {
    analyze_within(project_root, config, Budget::repair())
}

/// [`analyze`] under a caller's own budget.
///
/// # Errors
///
/// The same as [`analyze`].
pub fn analyze_within(project_root: &Path, config: &Config, budget: Budget) -> AppResult<Run> {
    let project = ProjectDir::open(project_root)?;
    Ok(ProjectFiles::within(project.path(), config, budget)?.checked())
}

/// One pass of every rule over a fantome archive, read where it lies.
///
/// The archive is never unpacked, so a check costs the bins it parses rather
/// than the whole of the tree an unpack would have written. `resolver` names
/// a packed WAD's chunks, exactly as it does for an unpack, so a site
/// addresses the same path either way.
///
/// # Errors
///
/// Reports an archive that cannot be opened or whose entry table cannot be
/// read. A rule that fails is recorded in [`Run::failed`] rather than failing
/// the run.
pub fn analyze_archive(
    archive: &Path,
    config: &Config,
    budget: Budget,
    resolver: &dyn PathResolver,
) -> AppResult<Run> {
    Ok(ProjectFiles::in_archive(archive, config, budget, resolver)?.checked())
}

impl ProjectFiles {
    /// Run every rule over these files, and collect what they report.
    #[must_use]
    fn checked(&self) -> Run {
        let started = Instant::now();
        let at = Utc::now();

        let mut report = Report::default();
        let mut rules = Vec::new();
        for rule in super::rules::all() {
            let mut info = rule.info();
            if let Some(dormancy) = rule.dormant(self) {
                info.state = RuleState::Dormant {
                    waiting: dormancy.waiting,
                    reason: dormancy.reason,
                    detail: dormancy.detail,
                };
            }
            rules.push(info);
            rule.check(self, &mut report);
        }
        let (mut problems, failed) = report.finish();

        // The panel draws this list in the order it arrives, so the order is
        // the engine's to decide: worst first, then by where the problem is.
        problems.sort_by(|a, b| {
            a.severity
                .cmp(&b.severity)
                .then_with(|| a.site.layer.cmp(&b.site.layer))
                .then_with(|| a.site.path.cmp(&b.site.path))
                .then_with(|| {
                    let a = a.site.node.as_ref().map(|node| node.path.as_str());
                    let b = b.site.node.as_ref().map(|node| node.path.as_str());
                    a.cmp(&b)
                })
        });

        let objects = ObjectInfo::catalogue(&problems, self.names());

        tracing::trace!(
            "Analyzed {} files of {}: {} problems, {} rule failures, in {:?}",
            self.file_count(),
            self.root.display(),
            problems.len(),
            failed.len(),
            started.elapsed()
        );

        Run {
            at,
            rules,
            objects,
            problems,
            failed,
        }
    }
}

#[cfg(test)]
mod tests;
