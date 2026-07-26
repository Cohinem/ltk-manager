//! What the patcher reports to the embedding application.

use super::injector::WadScanFailure;
use super::state::PatcherPhase;
use crate::error::AppError;

/// Notable conditions the patcher surfaces while a session runs.
///
/// The Tauri shell adapts these to frontend events and the tray icon; a CLI
/// maps them to log lines and an exit code. Everything the patcher wants to
/// *say* goes through here, which is what keeps the thread itself UI-agnostic.
pub trait PatcherEvents: Send + Sync {
    /// The lifecycle phase changed. Fired after the shared state has been
    /// updated, so an implementation that reads that state sees the new value.
    fn phase_changed(&self, phase: PatcherPhase);

    /// The session failed. Terminal - the thread resets to idle right after.
    fn error(&self, error: AppError);

    /// One or more archives failed the injected DLL's integrity scan, so no
    /// mods were applied and the session auto-stops.
    fn wad_scan_failed(&self, failures: Vec<WadScanFailure>);

    /// The overlay build found `count` enabled mods with unresolved linked
    /// dependencies. Advisory only: missing linked bins are non-fatal at
    /// injection, so the session carries on.
    fn linked_bin_warning(&self, count: u32);
}
