//! Lifecycle state shared between a patching session and its callers.

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::thread::JoinHandle;

use serde::Serialize;

/// Current phase of the patcher lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub enum PatcherPhase {
    Idle,
    Building,
    Patching,
}

/// Patcher configuration stashed so hot-reload can restart with the same
/// options.
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
    /// Overlay prefix the running session was started with (the overlay root,
    /// with a trailing separator). `None` while idle.
    pub overlay_prefix: Option<String>,
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
            overlay_prefix: None,
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
        assert!(inner.overlay_prefix.is_none());
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
}
