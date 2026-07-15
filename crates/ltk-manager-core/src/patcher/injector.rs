//! External-process injector via the host line protocol.
//!
//! We communicate with the host process over its stdin/stdout line protocol.
//! The host owns all injection logic (window scanning, `SetWindowsHookEx`, DLL
//! pipe) and reports structured lifecycle events back to us.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::host::{self, HOST_EXE_NAME, HostError, HostEvent, HostLine, HostState, PatcherHost};

/// Re-export the executable name that `commands/patcher.rs` resolves.
pub const INJECTOR_EXE_NAME: &str = HOST_EXE_NAME;

#[derive(Debug, thiserror::Error)]
pub enum InjectorError {
    #[error("Host process error: {0}")]
    Host(#[from] HostError),
    #[error("Host injection failed: {0}")]
    Failed(String),
}

/// Notable conditions the injector surfaces to the host application while a
/// session is running. Keeps the injector free of any Tauri/UI dependency: the
/// command layer supplies a callback that translates these into UI events.
#[derive(Debug, Clone)]
pub enum InjectorEvent {
    /// One or more archives failed the injected DLL's integrity scan, so no mods
    /// were applied this session. The DLL aborts on the first failure, so we
    /// auto-stop the patcher and surface the failures instead of silently doing
    /// nothing.
    WadScanFailed { failures: Vec<WadScanFailure> },
}

/// A single archive that failed the injected DLL's integrity scan.
#[derive(Debug, Clone)]
pub struct WadScanFailure {
    /// The archive (e.g. `TahmKench.wad.client`), if we could parse the name.
    pub wad: Option<String>,
    /// The NTSTATUS-style code the scan reported (e.g. `c0000229` skinhack,
    /// `c000003e` parse error). Callers classify it; the injector stays
    /// status-agnostic.
    pub status: String,
}

type EventCallback = Box<dyn Fn(InjectorEvent) + Send>;

/// How long to keep gathering "WAD scan failed" lines after the first before
/// reporting them together. They arrive as a burst during the game's load scan,
/// so a short window captures every offending archive.
const WAD_FAILURE_COLLECT_WINDOW: Duration = Duration::from_millis(750);

/// Drives one patching session against an already-running [`PatcherHost`].
///
/// The host process itself is spawned and kept alive by the caller (see
/// `commands::patcher`); the injector only runs the per-session event loop and,
/// on stop, issues a `stop` command rather than killing the host.
pub struct Injector {
    elevate: bool,
    on_event: Option<EventCallback>,
}

impl Default for Injector {
    fn default() -> Self {
        Self::new()
    }
}

impl Injector {
    pub fn new() -> Self {
        Self {
            elevate: false,
            on_event: None,
        }
    }

    /// Enable elevation mode (`--elevate`), which triggers a UAC prompt and
    /// runs the host at high integrity. Required when the game is protected
    /// by Vanguard.
    pub fn with_elevate(mut self, elevate: bool) -> Self {
        self.elevate = elevate;
        self
    }

    /// Register a callback invoked when the injector observes a notable
    /// condition during a session (see [`InjectorEvent`]).
    pub fn on_event(mut self, f: impl Fn(InjectorEvent) + Send + 'static) -> Self {
        self.on_event = Some(Box::new(f));
        self
    }

    fn emit_event(&self, event: InjectorEvent) {
        if let Some(cb) = &self.on_event {
            cb(event);
        }
    }

    /// Run one patching session's event loop against a persistent host, blocking
    /// until the game exits or `stop_flag` is set.
    ///
    /// The caller has already configured the host and started the scan; here we
    /// only consume `events` - the host's stdout line stream - dispatching events
    /// until the session ends. On stop (or an auto-stop from a failed WAD scan)
    /// we send `stop` to the host over `host` but leave the process running.
    ///
    /// Returns the event stream so the caller can hand it back to the host for
    /// the next session (see [`PatcherHost::restore_events`]).
    pub fn run_session(
        &self,
        events: Receiver<HostLine>,
        host: &Arc<Mutex<Option<PatcherHost>>>,
        stop_flag: &AtomicBool,
    ) -> (Result<(), InjectorError>, Receiver<HostLine>) {
        let result = self.event_loop(&events, host, stop_flag);
        (result, events)
    }

    /// Read and dispatch events from the host until the session is over.
    fn event_loop(
        &self,
        rx: &Receiver<HostLine>,
        host: &Arc<Mutex<Option<PatcherHost>>>,
        stop_flag: &AtomicBool,
    ) -> Result<(), InjectorError> {
        let mut state = SessionState::default();

        loop {
            // Finalize the WAD-failure report once its collection window elapses,
            // then fall through to the normal stop path below. Checked at the top
            // so it still fires on recv timeouts.
            if let Some(failures) = state.take_ready_failures() {
                tracing::warn!(
                    "Integrity scan rejected {} archive(s); stopping patcher",
                    failures.len()
                );
                self.emit_event(InjectorEvent::WadScanFailed { failures });
                stop_flag.store(true, Ordering::SeqCst);
            }

            if stop_flag.load(Ordering::SeqCst) {
                tracing::info!("Stop requested, sending stop to host");
                send_stop(host);
                return Ok(());
            }

            let line = match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Ok(line)) => line,
                Ok(Err(e)) => {
                    tracing::warn!("Host stdout read error: {}", e);
                    if stop_flag.load(Ordering::SeqCst) {
                        return Ok(());
                    }
                    return Err(self
                        .unexpected_exit_error(state.last_error.or_else(|| Some(e.to_string()))));
                }
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => {
                    // Reader thread ended: the host closed stdout / hit EOF. If we
                    // didn't ask it to stop, the host died on its own - it crashed,
                    // antivirus blocked it, or (on the elevated path) the user
                    // dismissed the UAC prompt. Surface that instead of silently
                    // reporting a clean stop.
                    if stop_flag.load(Ordering::SeqCst) {
                        return Ok(());
                    }
                    return Err(self.unexpected_exit_error(state.last_error));
                }
            };

            if !line.trim().is_empty() {
                self.dispatch_line(&line, &mut state)?;
            }
        }
    }

    /// Handle one parsed host line: log it and fold it into `state`. Returns `Err`
    /// only on a fatal `status failed`, which ends the session.
    fn dispatch_line(&self, line: &str, state: &mut SessionState) -> Result<(), InjectorError> {
        match host::parse_event(line) {
            Some(HostEvent::Ok { message, .. }) => tracing::debug!("[ltk-host] ok: {}", message),
            Some(HostEvent::Status {
                state: host_state,
                message,
                ..
            }) => self.handle_status(host_state, message)?,
            Some(HostEvent::Error { message, .. }) => {
                // A protocol-level error (e.g. an unrecognized command) is not
                // necessarily fatal to an in-progress injection - the host reports
                // fatal failures via `status failed`. Keep it so the EOF branch can
                // surface it as the reason if the host then dies.
                tracing::warn!("[ltk-host] error: {}", message);
                state.last_error = Some(message);
            }
            Some(HostEvent::DllLog {
                pid,
                tid,
                level,
                message,
                ..
            }) => {
                tracing::info!("[ltk-dll pid={} tid={} {}] {}", pid, tid, level, message);
                state.record_wad_failure(&message);
            }
            None => tracing::trace!("[ltk-host] unparsed: {}", line),
        }
        Ok(())
    }

    /// Log an injection-lifecycle transition. Only `Failed` ends the session; a
    /// game `Exited` keeps the loop alive so the host re-scans for the next game.
    fn handle_status(&self, state: HostState, message: String) -> Result<(), InjectorError> {
        match state {
            HostState::Injecting => tracing::info!("[ltk-host] injecting: {}", message),
            HostState::Injected => tracing::info!("[ltk-host] injected: {}", message),
            HostState::Waiting => tracing::info!("[ltk-host] waiting: {}", message),
            HostState::Exited => {
                tracing::info!(
                    "[ltk-host] game exited: {}; awaiting next instance",
                    message
                );
            }
            HostState::Failed => {
                tracing::error!("[ltk-host] failed: {}", message);
                return Err(InjectorError::Failed(message));
            }
        }
        Ok(())
    }

    /// Build the error returned when the host process disappears without us
    /// asking it to stop. Tailors the hint to whether we elevated, since a
    /// dismissed UAC prompt is the most common cause on the elevated path.
    fn unexpected_exit_error(&self, last_error: Option<String>) -> InjectorError {
        let base = if self.elevate {
            "The injection host exited unexpectedly. If you dismissed the Windows User Account Control (UAC) prompt, the patcher cannot run elevated - accept the prompt next time, or turn off \"Run injector elevated\" in Settings if League is not running as administrator."
        } else {
            "The injection host exited unexpectedly. It may have crashed or been blocked by antivirus."
        };
        match last_error {
            Some(detail) if !detail.is_empty() => {
                InjectorError::Failed(format!("{base} (host reported: {detail})"))
            }
            _ => InjectorError::Failed(base.to_string()),
        }
    }
}

/// Mutable state carried across one session's event loop.
#[derive(Default)]
struct SessionState {
    /// Most recent host `error` line, surfaced as the failure reason if the host
    /// then dies.
    last_error: Option<String>,
    /// WAD-scan failures gathered during the load-scan burst. The DLL emits one
    /// line per rejected archive then aborts, so we collect over a short window
    /// and report them together. `reported` latches so we finalize exactly once.
    failures: Vec<WadScanFailure>,
    collect_deadline: Option<Instant>,
    reported: bool,
}

impl SessionState {
    /// Fold a DLL log line into the failure set: parse it, de-duplicate by
    /// (wad, status), and arm the collection window on the first hit. Non-failure
    /// lines and anything after finalization are ignored.
    fn record_wad_failure(&mut self, message: &str) {
        if self.reported {
            return;
        }
        let Some(failure) = parse_wad_scan_failure(message) else {
            return;
        };
        let dup = self.failures.iter().any(|f| {
            f.status == failure.status
                && match (&f.wad, &failure.wad) {
                    (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
                    (None, None) => true,
                    _ => false,
                }
        });
        if !dup {
            self.failures.push(failure);
        }
        self.collect_deadline
            .get_or_insert_with(|| Instant::now() + WAD_FAILURE_COLLECT_WINDOW);
    }

    /// Once the collection window has elapsed, latch and hand back the gathered
    /// failures for reporting. Returns `Some` exactly once; `None` until ready.
    fn take_ready_failures(&mut self) -> Option<Vec<WadScanFailure>> {
        if self.reported || Instant::now() < self.collect_deadline? {
            return None;
        }
        self.reported = true;
        Some(std::mem::take(&mut self.failures))
    }
}

/// Send `stop` to the persistent host to tear down the current injection
/// session, leaving the process alive for reuse.
fn send_stop(host: &Arc<Mutex<Option<PatcherHost>>>) {
    if let Ok(mut guard) = host.lock()
        && let Some(h) = guard.as_mut()
    {
        let _ = h.stop_session();
    }
}

/// Parse a "WAD scan failed" line, e.g.
/// `error: WAD scan failed status with c0000229 for Ahri.wad.client`. Returns
/// `None` for non-failures, including the `warn:`-level line the DLL emits when
/// the scan is opted out (`OPT_OUT_AH_V1`) and keeps injecting. `wad` is present
/// when named; `status` falls back to `"unknown"`. The frontend classifies it.
// TODO: we shouldnt be making the patcher stop abruptly since it can cause crashes
fn parse_wad_scan_failure(message: &str) -> Option<WadScanFailure> {
    if !message.contains("WAD scan failed") {
        return None;
    }
    if message.trim_start().starts_with("warn:") {
        return None;
    }

    let status = message
        .split_once("status with ")
        .map(|(_, rest)| first_token(rest))
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown")
        .to_string();

    let wad = message
        .rsplit_once(" for ")
        .map(|(_, rest)| rest.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    Some(WadScanFailure { wad, status })
}

/// First whitespace-delimited token of `s` (empty string if none).
fn first_token(s: &str) -> &str {
    s.split_whitespace().next().unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_wad_scan_failure_with_wad_and_status() {
        let msg = "error: WAD scan failed status with c0000229 for Ahri.wad.client";
        let failure = parse_wad_scan_failure(msg).expect("should detect failure");
        assert_eq!(failure.wad.as_deref(), Some("Ahri.wad.client"));
        assert_eq!(failure.status, "c0000229");
    }

    #[test]
    fn ignores_warn_level_scan_line_from_opt_out() {
        // With OPT_OUT_AH_V1 set, the DLL logs the same text at warn level and
        // keeps injecting - it must not be reported as a fatal scan failure.
        assert!(
            parse_wad_scan_failure(
                "warn: WAD scan failed status with c0000229 for Ahri.wad.client"
            )
            .is_none()
        );
    }

    #[test]
    fn ignores_scanning_info_line() {
        assert!(parse_wad_scan_failure("info: Scanning champion Ahri.wad.client").is_none());
    }

    #[test]
    fn ignores_wad_log_hash_dump() {
        assert!(
            parse_wad_scan_failure("error: AH WAD Log:  9fed2719bffb7d50 51df2d746a6b6791")
                .is_none()
        );
    }

    #[test]
    fn falls_back_when_status_and_wad_missing() {
        let failure = parse_wad_scan_failure("error: WAD scan failed").expect("detected");
        assert_eq!(failure.wad, None);
        assert_eq!(failure.status, "unknown");
    }

    #[test]
    fn falls_back_to_unknown_status_but_keeps_wad() {
        let failure =
            parse_wad_scan_failure("error: WAD scan failed for Kayn.wad.client").expect("detected");
        assert_eq!(failure.wad.as_deref(), Some("Kayn.wad.client"));
        assert_eq!(failure.status, "unknown");
    }

    #[test]
    fn parses_arbitrary_status_code() {
        // The parser stays status-agnostic - any hex code parses the same way and
        // the frontend classifies it. c0000225 is no longer emitted at runtime
        // (linked bins are validated pre-flight); kept here to prove that.
        let failure = parse_wad_scan_failure(
            "error: WAD scan failed status with c0000225 for TahmKench.wad.client",
        )
        .expect("parseable scan failure");
        assert_eq!(failure.wad.as_deref(), Some("TahmKench.wad.client"));
        assert_eq!(failure.status, "c0000225");
    }

    #[test]
    fn detects_wad_scan_failure_from_ltk_patcher_dll_target() {
        // The message reaching us is the DLL record text after the level field
        // (`host::parse_event` strips the level), which the new DLL prefixes with
        // its `tracing` target. The parser keys off `WAD scan failed`, so the
        // target prefix is irrelevant.
        let msg =
            "ltk_patcher_dll::verify: WAD scan failed status with c0000229 for briar.wad.client";
        let failure = parse_wad_scan_failure(msg).expect("should detect failure");
        assert_eq!(failure.wad.as_deref(), Some("briar.wad.client"));
        assert_eq!(failure.status, "c0000229");
    }

    #[test]
    fn ignores_overlay_verification_failed_line() {
        // The DLL logs a second ERROR right after the scan failure, summarizing
        // the disabled overlay. It must not be mistaken for a separate failure
        // (it lacks the `WAD scan failed` phrase), or briar would be counted twice.
        assert!(parse_wad_scan_failure(
            "ltk_patcher_dll::verify: overlay verification failed, disabling overlay: wad data/final/champions/briar.wad.client: anti-hack scan blocked (c0000229): 21a1ca943ae71cbc a9d31e88e92e4715"
        )
        .is_none());
    }
}
