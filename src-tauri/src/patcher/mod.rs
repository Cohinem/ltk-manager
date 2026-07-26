pub mod api;
pub mod runner;
pub mod thread;

// Host process management, the injector event loop, and per-session
// orchestration live in the Tauri-free core crate; re-exported here so the
// shell keeps its `crate::patcher::…` paths while the extraction proceeds.
pub use ltk_manager_core::patcher::{host, injector, session, PatcherError};

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use ltk_manager_core::patcher::host::PatcherHost;
use serde::Serialize;
use ts_rs::TS;

/// Current phase of the patcher lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum PatcherPhase {
    Idle,
    Building,
    Patching,
}

pub struct PatcherState(pub Arc<Mutex<PatcherStateInner>>);

impl PatcherState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(PatcherStateInner::new())))
    }
}

/// Tauri-managed handle to the persistent host. `None` until the first patcher
/// start spawns it (lazy start); cleared when the host dies so the next start
/// respawns.
pub struct PatcherHostState(pub Arc<Mutex<Option<PatcherHost>>>);

impl Default for PatcherHostState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

impl Default for PatcherState {
    fn default() -> Self {
        Self::new()
    }
}

/// Stored patcher configuration for hot-reload (re-start with the same options).
#[derive(Debug, Clone)]
pub struct StoredPatcherConfig {
    pub flags: Option<u64>,
    pub workshop_projects: Option<Vec<String>>,
}

pub struct PatcherStateInner {
    /// Flag to signal the patcher thread to stop.
    pub stop_flag: Arc<AtomicBool>,
    /// Handle to the patcher thread.
    pub thread_handle: Option<JoinHandle<()>>,
    /// The config path used when starting.
    pub config_path: Option<String>,
    /// Current phase of the patcher lifecycle.
    pub phase: PatcherPhase,
    /// Last patcher config used, for hot-reload.
    pub last_config: Option<StoredPatcherConfig>,
}

impl PatcherStateInner {
    pub fn new() -> Self {
        Self {
            stop_flag: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
            config_path: None,
            phase: PatcherPhase::Idle,
            last_config: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.thread_handle
            .as_ref()
            .map(|h| !h.is_finished())
            .unwrap_or(false)
    }
}

impl Default for PatcherStateInner {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patcher_state_inner_defaults_to_idle() {
        let inner = PatcherStateInner::new();
        assert_eq!(inner.phase, PatcherPhase::Idle);
        assert!(inner.thread_handle.is_none());
        assert!(inner.config_path.is_none());
    }

    #[test]
    fn is_running_false_when_no_thread() {
        let inner = PatcherStateInner::new();
        assert!(!inner.is_running());
    }

    #[test]
    fn patcher_phase_serialization() {
        assert_eq!(
            serde_json::to_string(&PatcherPhase::Idle).unwrap(),
            "\"idle\""
        );
        assert_eq!(
            serde_json::to_string(&PatcherPhase::Building).unwrap(),
            "\"building\""
        );
        assert_eq!(
            serde_json::to_string(&PatcherPhase::Patching).unwrap(),
            "\"patching\""
        );
    }

    #[test]
    fn patcher_host_state_defaults_to_empty() {
        let state = PatcherHostState::default();
        assert!(
            state.0.lock().unwrap().is_none(),
            "no host until the first patcher start spawns one (lazy start)"
        );
    }

    #[test]
    fn patcher_state_new_creates_valid_state() {
        let state = PatcherState::new();
        let inner = state.0.lock().unwrap();
        assert!(!inner.is_running());
        assert_eq!(inner.phase, PatcherPhase::Idle);
    }
}
