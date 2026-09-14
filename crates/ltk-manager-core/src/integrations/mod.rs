//! Managed tool installations and observed Explorer registrations.

mod process;
mod registry;
mod releases;
mod types;

pub use types::*;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::sync::atomic::{AtomicBool, Ordering};

use fs_err as fs;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::utils::fs::atomic_write;

type Result<T> = std::result::Result<T, IntegrationError>;
static OPERATION: LazyLock<Mutex<Option<IntegrationOperation>>> =
    LazyLock::new(|| Mutex::new(None));
static CANCEL: AtomicBool = AtomicBool::new(false);
static MUTATING: Mutex<()> = Mutex::new(());
const TOOLS: [Tool; 2] = [Tool::Wadtools, Tool::TexToolz];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Installation {
    directory: String,
    tag: String,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegistryChange {
    previous: registry::Snapshot,
    target: registry::Snapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Receipt {
    schema: u32,
    active: Option<Installation>,
    retired: Vec<Installation>,
    menu_enabled: bool,
    before: registry::Snapshot,
    applied: registry::Snapshot,
    pending: bool,
    registry_change: Option<RegistryChange>,
}

impl Receipt {
    fn new(tool: Tool) -> Self {
        Self {
            schema: 1,
            active: None,
            retired: Vec::new(),
            menu_enabled: false,
            before: vec![None; registry::roots(tool).len()],
            applied: vec![None; registry::roots(tool).len()],
            pending: false,
            registry_change: None,
        }
    }
}

/// The fixed per-user installation root and its ownership receipts.
#[derive(Debug)]
pub struct Integrations {
    root: PathBuf,
}

impl Integrations {
    /// The current user's managed installations.
    ///
    /// # Errors
    /// Fails if the operating system does not provide a user data directory.
    pub fn discover() -> Result<Self> {
        let base = std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("XDG_DATA_HOME"))
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(|home| PathBuf::from(home).join(".local/share").into_os_string())
            })
            .ok_or(IntegrationError::Unsupported)?;
        Ok(Self {
            root: PathBuf::from(base).join("LeagueToolkit/Manager/integrations"),
        })
    }

    fn tool_root(&self, tool: Tool) -> PathBuf {
        self.root.join(tool.id())
    }
    fn receipt_path(&self, tool: Tool) -> PathBuf {
        self.tool_root(tool).join("receipt.json")
    }
    fn directory(&self, tool: Tool, install: &Installation) -> PathBuf {
        self.tool_root(tool)
            .join("versions")
            .join(&install.directory)
    }
    fn executable(&self, tool: Tool, install: &Installation) -> PathBuf {
        self.directory(tool, install).join(tool.executable())
    }

    fn read(&self, tool: Tool) -> Result<Receipt> {
        let bytes = match fs::read(self.receipt_path(tool)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Receipt::new(tool)),
            Err(e) => return Err(e.into()),
        };
        if bytes.len() > 4 * 1024 * 1024 {
            return Err(IntegrationError::InvalidReceipt);
        }
        let receipt: Receipt =
            serde_json::from_slice(&bytes).map_err(|_| IntegrationError::InvalidReceipt)?;
        validate_receipt(tool, &receipt)?;
        for install in receipt.active.iter().chain(&receipt.retired) {
            for directory in [
                self.tool_root(tool),
                self.tool_root(tool).join("versions"),
                self.directory(tool, install),
            ] {
                reject_link(&directory)?;
            }
        }
        Ok(receipt)
    }

    fn save(&self, tool: Tool, receipt: &Receipt) -> Result<()> {
        fs::create_dir_all(self.tool_root(tool))?;
        atomic_write(
            &self.receipt_path(tool),
            &serde_json::to_vec_pretty(receipt)?,
        )?;
        Ok(())
    }

    /// Local installation and registry observations for both tools.
    ///
    /// # Errors
    /// Fails on unreadable ownership receipts or registry keys.
    pub fn status(&self) -> Result<Vec<IntegrationStatus>> {
        TOOLS
            .into_iter()
            .map(|tool| self.tool_status(tool))
            .collect()
    }

    fn tool_status(&self, tool: Tool) -> Result<IntegrationStatus> {
        let receipt = self.read(tool)?;
        let menus = registry::snapshot(tool)?;
        let menu = if registry::empty(&menus) {
            MenuStatus::Absent
        } else if !registry::empty(&receipt.applied) && menus == receipt.applied {
            MenuStatus::Enabled
        } else if receipt.menu_enabled || receipt.pending {
            MenuStatus::Changed
        } else {
            MenuStatus::External
        };
        let directory = receipt.active.as_ref().map(|i| self.directory(tool, i));
        let needs_repair = receipt.pending
            || receipt.active.as_ref().is_some_and(|i| {
                i.files.keys().any(|name| {
                    fs::metadata(self.directory(tool, i).join(name)).map_or(true, |m| !m.is_file())
                })
            });
        let mut external_paths = registry::targets(&menus);
        external_paths.extend(external_candidates(tool));
        external_paths.retain(|p| !Path::new(p).starts_with(&self.root));
        external_paths.sort_by_key(|p| p.to_lowercase());
        external_paths.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        let operation = OPERATION
            .lock()
            .as_ref()
            .filter(|op| op.tool == tool)
            .cloned();
        Ok(IntegrationStatus {
            tool,
            supported: supported(),
            version: receipt.active.as_ref().map(|i| i.tag.clone()),
            directory: directory.map(|d| d.to_string_lossy().into_owned()),
            needs_repair,
            pending_cleanup: !receipt.retired.is_empty(),
            menu,
            menu_requested: receipt.menu_enabled,
            external_paths,
            handler_path: if tool == Tool::TexToolz {
                registry::handler_path()?
            } else {
                None
            },
            operation,
        })
    }

    /// The latest stable release with supported, verifiable assets.
    ///
    /// # Errors
    /// Fails on transport errors or an unsupported release contract.
    pub fn check_release(&self, tool: Tool) -> Result<IntegrationRelease> {
        let release = releases::resolve(tool, None)?;
        Ok(releases::summary(tool, &release))
    }

    /// Apply one tool change under an interprocess installation lock.
    ///
    /// # Errors
    /// Fails on unsupported platforms, ownership conflicts, verification or operating system errors.
    pub fn change(
        &self,
        tool: Tool,
        action: IntegrationAction,
        conflicts: MenuConflictPolicy,
    ) -> Result<()> {
        if !supported() {
            return Err(IntegrationError::Unsupported);
        }
        let _guard = MUTATING.try_lock().ok_or(IntegrationError::Busy)?;
        fs::create_dir_all(&self.root)?;
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.root.join("operation.lock"))?;
        lock.file().try_lock().map_err(|_| IntegrationError::Busy)?;
        CANCEL.store(false, Ordering::Release);
        *OPERATION.lock() = Some(IntegrationOperation {
            id: uuid::Uuid::new_v4().to_string(),
            tool,
            stage: IntegrationStage::Checking,
            downloaded: 0,
            total: None,
            error: None,
        });
        let result = self.apply(tool, action, conflicts);
        if let Some(op) = OPERATION.lock().as_mut() {
            op.stage = match &result {
                Ok(()) => IntegrationStage::Complete,
                Err(IntegrationError::Cancelled) => IntegrationStage::Cancelled,
                Err(_) => IntegrationStage::Failed,
            };
            op.error = result.as_ref().err().cloned();
        }
        result
    }

    fn apply(
        &self,
        tool: Tool,
        action: IntegrationAction,
        conflicts: MenuConflictPolicy,
    ) -> Result<()> {
        let mut receipt = self.read(tool)?;
        self.resume_registry(tool, &mut receipt)?;
        match action {
            IntegrationAction::Install
            | IntegrationAction::InstallOnly
            | IntegrationAction::Repair => {
                if action == IntegrationAction::Repair && receipt.active.is_none() {
                    return Err(IntegrationError::NotInstalled);
                }
                let enable_menu = (receipt.active.is_none()
                    && action != IntegrationAction::InstallOnly)
                    || receipt.menu_enabled;
                if enable_menu {
                    check_conflicts(tool, &receipt, conflicts)?;
                }
                let pinned = if action == IntegrationAction::Repair {
                    receipt.active.as_ref().map(|i| i.tag.as_str())
                } else {
                    None
                };
                let release = releases::resolve(tool, pinned)?;
                if let Some(active) = &receipt.active {
                    let installed = semver::Version::parse(active.tag.trim_start_matches('v'))
                        .map_err(|_| IntegrationError::InvalidReceipt)?;
                    let available =
                        semver::Version::parse(release.tag_name.trim_start_matches('v'))
                            .map_err(|_| IntegrationError::InvalidReceipt)?;
                    if available < installed {
                        return Err(releases::contract("automatic downgrades are not supported"));
                    }
                }
                let old = receipt.clone();
                let install = self.stage(tool, &release)?;
                receipt.retired.push(install.clone());
                self.save(tool, &receipt)?;
                if let Some(previous) = &receipt.active {
                    for name in ["wadtools.toml", "ltk-tex-utils.toml"] {
                        let source = self.directory(tool, previous).join(name);
                        match fs::read(&source) {
                            Ok(bytes) => {
                                fs::write(self.directory(tool, &install).join(name), bytes)?
                            }
                            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
                            Err(error) => return Err(error.into()),
                        }
                    }
                }
                receipt.retired.pop();
                if let Some(previous) = receipt.active.replace(install) {
                    receipt.retired.push(previous);
                }
                receipt.pending = true;
                self.save(tool, &receipt)?;
                if enable_menu {
                    let result = self.enable_menu(tool, &mut receipt, conflicts);
                    if let Err(error) = result {
                        // Keep both versions and the pending receipt if rollback cannot prove ownership.
                        if self.rollback(tool, &receipt, &old).is_ok() {
                            let mut restored = old;
                            if let Some(failed) = receipt.active.take() {
                                restored.retired.push(failed);
                            }
                            self.cleanup(tool, &mut restored);
                            self.save(tool, &restored)?;
                        }
                        return Err(error);
                    }
                }
                receipt.pending = false;
                self.cleanup(tool, &mut receipt);
                self.save(tool, &receipt)?;
            }
            IntegrationAction::EnableMenu => self.enable_menu(tool, &mut receipt, conflicts)?,
            IntegrationAction::DisableMenu => self.disable_menu(tool, &mut receipt)?,
            IntegrationAction::Uninstall => {
                self.disable_menu(tool, &mut receipt)?;
                stage(IntegrationStage::Removing);
                if let Some(active) = receipt.active.take() {
                    receipt.retired.push(active);
                }
                receipt.pending = false;
                self.save(tool, &receipt)?;
                self.cleanup(tool, &mut receipt);
                self.save(tool, &receipt)?;
            }
        }
        Ok(())
    }

    fn stage(&self, tool: Tool, release: &releases::Release) -> Result<Installation> {
        stage(IntegrationStage::Downloading);
        fs::create_dir_all(self.tool_root(tool).join("versions"))?;
        let temp = tempfile::tempdir_in(self.tool_root(tool).join("versions"))?;
        for asset in releases::assets(tool, release)? {
            let target = temp.path().join(&asset.name);
            releases::download(asset, &target, |downloaded, total| {
                if CANCEL.load(Ordering::Acquire) {
                    return Err(IntegrationError::Cancelled);
                }
                if let Some(op) = OPERATION.lock().as_mut() {
                    op.downloaded = downloaded;
                    op.total = Some(total);
                }
                Ok(())
            })?;
            if tool == Tool::Wadtools {
                releases::extract_wad(&target, &temp.path().join(tool.executable()))?;
                fs::remove_file(target)?;
            } else {
                let name = if asset.name.ends_with(".exe") {
                    tool.executable()
                } else {
                    "ltk_tex_thumb_handler.dll"
                };
                fs::rename(&target, temp.path().join(name))?;
            }
        }
        let executable = temp.path().join(tool.executable());
        let version = process::run(&executable, &["--version"])?;
        let expected = release.tag_name.trim_start_matches('v');
        if !version.split_whitespace().any(|word| word == expected) {
            return Err(releases::contract(
                "executable version differs from release",
            ));
        }
        let mut files = BTreeMap::new();
        files.insert(tool.executable().to_owned(), releases::hash(&executable)?);
        if tool == Tool::TexToolz {
            files.insert(
                "ltk_tex_thumb_handler.dll".into(),
                releases::hash(&temp.path().join("ltk_tex_thumb_handler.dll"))?,
            );
        }
        let directory = uuid::Uuid::new_v4().to_string();
        let install = Installation {
            directory,
            tag: release.tag_name.clone(),
            files,
        };
        {
            let mut operation = OPERATION.lock();
            if CANCEL.load(Ordering::Acquire) {
                return Err(IntegrationError::Cancelled);
            }
            if let Some(op) = operation.as_mut() {
                op.stage = IntegrationStage::Installing;
                op.total = None;
                op.downloaded = 0;
            }
        }
        fs::rename(temp.path(), self.directory(tool, &install))?;
        Ok(install)
    }

    fn enable_menu(
        &self,
        tool: Tool,
        receipt: &mut Receipt,
        conflicts: MenuConflictPolicy,
    ) -> Result<()> {
        let active = receipt
            .active
            .as_ref()
            .ok_or(IntegrationError::NotInstalled)?;
        let executable = self.executable(tool, active);
        verify_files(&self.directory(tool, active), active)?;
        let current = check_conflicts(tool, receipt, conflicts)?;
        if current != receipt.applied {
            receipt.before = current.clone();
        }
        receipt.pending = true;
        self.save(tool, receipt)?;
        stage(IntegrationStage::Registering);
        let applied = registry::menus(tool, &executable.to_string_lossy());
        receipt.registry_change = Some(RegistryChange {
            previous: current,
            target: applied.clone(),
        });
        receipt.applied = applied;
        receipt.menu_enabled = true;
        self.save(tool, receipt)?;
        self.resume_registry(tool, receipt)
    }

    fn disable_menu(&self, tool: Tool, receipt: &mut Receipt) -> Result<()> {
        if !receipt.menu_enabled && !receipt.pending {
            return Ok(());
        }
        stage(IntegrationStage::Registering);
        let current = registry::snapshot(tool)?;
        if !registry::empty(&current) && current != receipt.applied {
            return Err(IntegrationError::Conflict);
        }
        let target = if registry::empty(&current) {
            current.clone()
        } else {
            receipt.before.clone()
        };
        receipt.registry_change = Some(RegistryChange {
            previous: current,
            target,
        });
        receipt.applied = vec![None; registry::roots(tool).len()];
        receipt.before = receipt.applied.clone();
        receipt.menu_enabled = false;
        receipt.pending = true;
        self.save(tool, receipt)?;
        self.resume_registry(tool, receipt)
    }

    fn resume_registry(&self, tool: Tool, receipt: &mut Receipt) -> Result<()> {
        let Some(change) = &receipt.registry_change else {
            return Ok(());
        };
        let current = registry::snapshot(tool)?;
        if !registry::can_resume(&current, &change.previous, &change.target) {
            return Err(IntegrationError::Conflict);
        }
        registry::restore(tool, &current, &change.target)?;
        receipt.registry_change = None;
        receipt.pending = false;
        self.save(tool, receipt)
    }

    fn rollback(&self, tool: Tool, receipt: &Receipt, old: &Receipt) -> Result<()> {
        let current = registry::snapshot(tool)?;
        if current == old.applied {
            return Ok(());
        }
        let executable = self.executable(
            tool,
            receipt
                .active
                .as_ref()
                .ok_or(IntegrationError::NotInstalled)?,
        );
        if current != registry::menus(tool, &executable.to_string_lossy()) {
            return Err(IntegrationError::Conflict);
        }
        let target = if registry::empty(&old.applied) {
            &receipt.before
        } else {
            &old.applied
        };
        registry::restore(tool, &current, target)
    }

    fn cleanup(&self, tool: Tool, receipt: &mut Receipt) {
        let targets = match registry::snapshot(tool) {
            Ok(snapshot) => registry::targets(&snapshot),
            Err(_) => return,
        };
        receipt.retired.retain(|install| {
            let directory = self.directory(tool, install);
            let executable = directory
                .join(tool.executable())
                .to_string_lossy()
                .replace('/', "\\");
            if targets
                .iter()
                .any(|target| target.replace('/', "\\").eq_ignore_ascii_case(&executable))
            {
                return true;
            }
            let mut pending = false;
            for name in install.files.keys() {
                match fs::remove_file(directory.join(name)) {
                    Ok(()) => (),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                    Err(_) => pending = true,
                }
            }
            // Configuration and tool outputs are not owned payload files.
            let _ = fs::remove_dir(&directory);
            pending
        });
    }
}

/// Cancel the matching operation while it is still downloading.
pub fn cancel_download(operation_id: &str) {
    if OPERATION.lock().as_ref().is_some_and(|op| {
        op.id == operation_id
            && matches!(
                op.stage,
                IntegrationStage::Checking | IntegrationStage::Downloading
            )
    }) {
        CANCEL.store(true, Ordering::Release);
    }
}

fn stage(value: IntegrationStage) {
    if let Some(op) = OPERATION.lock().as_mut() {
        op.stage = value;
        op.downloaded = 0;
        op.total = None;
    }
}

fn supported() -> bool {
    cfg!(all(windows, target_arch = "x86_64"))
}

fn check_conflicts(
    tool: Tool,
    receipt: &Receipt,
    conflicts: MenuConflictPolicy,
) -> Result<registry::Snapshot> {
    let current = registry::snapshot(tool)?;
    if !registry::empty(&current)
        && current != receipt.applied
        && conflicts == MenuConflictPolicy::Preserve
    {
        return Err(IntegrationError::Conflict);
    }
    Ok(current)
}

fn validate_receipt(tool: Tool, receipt: &Receipt) -> Result<()> {
    if receipt.schema != 1
        || receipt.before.len() != registry::roots(tool).len()
        || receipt.applied.len() != receipt.before.len()
    {
        return Err(IntegrationError::InvalidReceipt);
    }
    for snapshot in [&receipt.before, &receipt.applied].into_iter().chain(
        receipt
            .registry_change
            .iter()
            .flat_map(|change| [&change.previous, &change.target]),
    ) {
        registry::validate_snapshot(tool, snapshot)?;
    }
    for install in receipt.active.iter().chain(&receipt.retired) {
        if uuid::Uuid::parse_str(&install.directory).is_err()
            || releases::validate_tag(&install.tag).is_err()
        {
            return Err(IntegrationError::InvalidReceipt);
        }
        if !install.files.contains_key(tool.executable())
            || install.files.iter().any(|(name, digest)| {
                (name != tool.executable()
                    && !(tool == Tool::TexToolz && name == "ltk_tex_thumb_handler.dll"))
                    || digest.len() != 64
                    || !digest.bytes().all(|c| c.is_ascii_hexdigit())
            })
        {
            return Err(IntegrationError::InvalidReceipt);
        }
    }
    Ok(())
}

fn reject_link(path: &Path) -> Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    if metadata.file_type().is_symlink() {
        return Err(IntegrationError::InvalidReceipt);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Reparse points include junctions, which are not reported as symbolic links.
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(IntegrationError::InvalidReceipt);
        }
    }
    Ok(())
}

fn verify_files(directory: &Path, install: &Installation) -> Result<()> {
    for (name, digest) in &install.files {
        if releases::hash(&directory.join(name))? != *digest {
            return Err(IntegrationError::Integrity);
        }
    }
    Ok(())
}

fn external_candidates(tool: Tool) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let relative = match tool {
            Tool::Wadtools => "wadtools/bin",
            Tool::TexToolz => "LeagueToolkit/ltk-tex-utils",
        };
        candidates.push(PathBuf::from(local).join(relative).join(tool.executable()));
    }
    if let Some(home) = std::env::var_os("USERPROFILE")
        && tool == Tool::Wadtools
    {
        candidates.push(PathBuf::from(home).join(".wadtools/bin/wadtools.exe"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|p| p.join(tool.executable())));
    }
    candidates
        .into_iter()
        .filter(|p| fs::metadata(p).is_ok_and(|m| m.is_file()))
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests;
