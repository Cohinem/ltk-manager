//! Line-protocol client for the injection host process.
//!
//! The host process owns all injection logic and communicates with us over a
//! line-oriented protocol on stdin (commands) and stdout (events).

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// Bundled host executable name.
pub const HOST_EXE_NAME: &str = "ltk_patcher_host.exe";

/// Bundled hook DLL the host injects into the game. This is the file the
/// diagnostics suite inspects (presence / signature / lock) — it replaced the
/// legacy in-process `cslol-dll.dll`.
pub const HOOK_DLL_NAME: &str = "ltk_patcher_dll.dll";

// ---------------------------------------------------------------------------
// Protocol constants
// ---------------------------------------------------------------------------

mod proto {
    // Commands (UI → host)
    pub const CMD_START: &str = "start";
    pub const CMD_CONFIG: &str = "config";
    pub const CMD_STOP: &str = "stop";

    // Start methods
    pub const METHOD_SCAN: &str = "scan";
    pub const METHOD_PASSIVE: &str = "passive";

    // Config keys
    pub const CONFIG_LOGLEVEL: &str = "loglevel";
    pub const CONFIG_FLAGS: &str = "flags";
    pub const CONFIG_PREFIX: &str = "prefix";

    // Event keywords (host → UI)
    pub const EVT_DLL: &str = "dll";
    pub const EVT_OK: &str = "ok";
    pub const EVT_STATUS: &str = "status";
    pub const EVT_ERROR: &str = "error";

    // Status states
    pub const STATE_INJECTING: &str = "injecting";
    pub const STATE_INJECTED: &str = "injected";
    pub const STATE_WAITING: &str = "waiting";
    pub const STATE_EXITED: &str = "exited";
    pub const STATE_FAILED: &str = "failed";
}

// ---------------------------------------------------------------------------
// Hook flag bits
// ---------------------------------------------------------------------------

/// Hook flag bits forwarded to the host via `config flags <N>`
pub mod hook_flags {
    /// `CSLOL_HOOK_DISABLE_VERIFY` — skip the signature-verification bypass,
    /// leaving the game's own file verification intact.
    pub const DISABLE_VERIFY: u32 = 1;
    /// `CSLOL_HOOK_DISABLE_FILE` — disable the filesystem overlay, so no modded
    /// files are redirected into the game.
    pub const DISABLE_FILE: u32 = 2;
    /// `CSLOL_HOOK_OPT_OUT_AH_V1` — opt out of anti-skinhack v1 enforcement: a
    /// failed WAD scan is downgraded from a blocking error to a warning, so
    /// patching proceeds instead of aborting.
    pub const OPT_OUT_AH_V1: u32 = 4;
}

// ---------------------------------------------------------------------------
// Host log level
// ---------------------------------------------------------------------------

#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostLogLevel {
    Error = 0,
    Info = 0x10,
    Debug = 0x20,
    All = 0x1000,
}

// ---------------------------------------------------------------------------
// Configuration sent to the host before starting
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct HostConfig {
    /// Overlay prefix path (the overlay root directory, with trailing separator).
    pub prefix: String,
    /// DLL log level.
    pub log_level: HostLogLevel,
    /// Hook flags bitmask (see [`hook_flags`]; `0` = full functionality).
    pub flags: u32,
}

// ---------------------------------------------------------------------------
// Parsed events from the host
// ---------------------------------------------------------------------------

/// Injection lifecycle state reported by the host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostState {
    /// Scanning for the game window / hooking its thread.
    Injecting,
    /// DLL attached to the game process.
    Injected,
    /// DLL is overlaying; waiting for the game to exit.
    Waiting,
    /// Game process exited.
    Exited,
    /// Injection failed (message has the reason).
    Failed,
}

impl HostState {
    fn parse(s: &str) -> Option<Self> {
        match s {
            proto::STATE_INJECTING => Some(Self::Injecting),
            proto::STATE_INJECTED => Some(Self::Injected),
            proto::STATE_WAITING => Some(Self::Waiting),
            proto::STATE_EXITED => Some(Self::Exited),
            proto::STATE_FAILED => Some(Self::Failed),
            _ => None,
        }
    }
}

/// A parsed event line from the host.
#[derive(Debug, Clone)]
pub enum HostEvent {
    /// A command was processed successfully.
    Ok { timestamp: String, message: String },
    /// Injection lifecycle transition.
    Status {
        timestamp: String,
        state: HostState,
        message: String,
    },
    /// A protocol-level error.
    Error { timestamp: String, message: String },
    /// A log record forwarded from the injected DLL.
    DllLog {
        timestamp: String,
        pid: u64,
        tid: u64,
        /// The DLL's `tracing` level for this record (e.g. `info`, `warn`,
        /// `error`).
        level: String,
        message: String,
    },
}

/// Parse one host→UI event line. Returns `None` for blank/unparseable lines.
pub fn parse_event(line: &str) -> Option<HostEvent> {
    let line = line.trim_end_matches(['\r', '\n']);
    if line.is_empty() {
        return None;
    }

    let mut parts = line.splitn(2, ' ');
    let keyword = parts.next()?;
    let rest = parts.next().unwrap_or("");

    match keyword {
        proto::EVT_OK => {
            // "ok <timestamp> <msg...>"
            let (timestamp, message) = split_first_token(rest);
            Some(HostEvent::Ok {
                timestamp: timestamp.to_owned(),
                message: message.to_owned(),
            })
        }
        proto::EVT_STATUS => {
            // "status <timestamp> <state> <msg...>"
            let (timestamp, after_ts) = split_first_token(rest);
            let (state_str, message) = split_first_token(after_ts);
            let state = HostState::parse(state_str)?;
            Some(HostEvent::Status {
                timestamp: timestamp.to_owned(),
                state,
                message: message.to_owned(),
            })
        }
        proto::EVT_ERROR => {
            // "error <timestamp> <msg...>"
            let (timestamp, message) = split_first_token(rest);
            Some(HostEvent::Error {
                timestamp: timestamp.to_owned(),
                message: message.to_owned(),
            })
        }
        proto::EVT_DLL => {
            // "dll <timestamp> <pid> <tid> <level> <msg...>"
            let (timestamp, after_ts) = split_first_token(rest);
            let (pid_str, after_pid) = split_first_token(after_ts);
            let (tid_str, after_tid) = split_first_token(after_pid);
            let (level, message) = split_first_token(after_tid);
            let pid = pid_str.parse().ok()?;
            let tid = tid_str.parse().ok()?;
            Some(HostEvent::DllLog {
                timestamp: timestamp.to_owned(),
                pid,
                tid,
                level: level.to_owned(),
                message: message.to_owned(),
            })
        }
        _ => {
            tracing::warn!("[ltk-host] Unknown event keyword: {}", keyword);
            None
        }
    }
}

/// Split off the first whitespace-delimited token, returning `(token, rest)`.
/// If there is no token, returns `("", "")`.
fn split_first_token(s: &str) -> (&str, &str) {
    let s = s.trim_start();
    match s.find([' ', '\t']) {
        Some(pos) => (&s[..pos], s[pos + 1..].trim_start()),
        None => (s, ""),
    }
}

// ---------------------------------------------------------------------------
// Host process wrapper
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("Failed to spawn host '{path}': {source}")]
    Spawn {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("Host stdin closed unexpectedly")]
    StdinClosed,
    #[error("Host stdout closed unexpectedly")]
    StdoutClosed,
    #[error("Host reported error: {0}")]
    Protocol(String),
}

/// Manages a running host child process.
pub struct HostProcess {
    child: Child,
    exe_path: PathBuf,
}

impl HostProcess {
    /// Spawn the host process. If `elevate` is true, passes `--elevate` which
    /// triggers a UAC prompt and runs the host at high integrity.
    pub fn spawn(exe_path: &Path, elevate: bool) -> Result<Self, HostError> {
        let mut command = Command::new(exe_path);

        if elevate {
            command.arg("--elevate");
        }

        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = exe_path.parent() {
            command.current_dir(dir);
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        tracing::info!(
            "Spawning host: {} {}",
            exe_path.display(),
            if elevate { "--elevate" } else { "" }
        );

        let child = command.spawn().map_err(|source| HostError::Spawn {
            path: exe_path.display().to_string(),
            source,
        })?;

        Ok(Self {
            child,
            exe_path: exe_path.to_path_buf(),
        })
    }

    /// Send a raw command line to the host's stdin.
    pub fn send_command(&mut self, cmd: &str) -> Result<(), HostError> {
        let stdin = self.child.stdin.as_mut().ok_or(HostError::StdinClosed)?;
        tracing::debug!("[ltk-host] >> {}", cmd);
        writeln!(stdin, "{}", cmd).map_err(|_| HostError::StdinClosed)?;
        stdin.flush().map_err(|_| HostError::StdinClosed)?;
        Ok(())
    }

    /// Send all config commands derived from a `HostConfig`.
    pub fn configure(&mut self, config: &HostConfig) -> Result<(), HostError> {
        self.send_command(&format!(
            "{} {} {}",
            proto::CMD_CONFIG,
            proto::CONFIG_LOGLEVEL,
            config.log_level as u32
        ))?;
        self.send_command(&format!(
            "{} {} {}",
            proto::CMD_CONFIG,
            proto::CONFIG_FLAGS,
            config.flags
        ))?;
        self.send_command(&format!(
            "{} {} {}",
            proto::CMD_CONFIG,
            proto::CONFIG_PREFIX,
            config.prefix
        ))?;
        Ok(())
    }

    /// Send `start scan` to begin host-driven injection.
    pub fn start_scan(&mut self) -> Result<(), HostError> {
        self.send_command(&format!("{} {}", proto::CMD_START, proto::METHOD_SCAN))
    }

    /// Send `start passive` for modding-framework integration.
    #[allow(dead_code)]
    pub fn start_passive(&mut self) -> Result<(), HostError> {
        self.send_command(&format!("{} {}", proto::CMD_START, proto::METHOD_PASSIVE))
    }

    /// Send `stop` to tear down the current injection session.
    pub fn stop_session(&mut self) -> Result<(), HostError> {
        self.send_command(proto::CMD_STOP)
    }

    /// Take stdout and wrap it in a buffered line reader for event parsing.
    /// This consumes the stdout handle — call once.
    pub fn take_event_reader(&mut self) -> Option<BufReader<std::process::ChildStdout>> {
        self.child.stdout.take().map(BufReader::new)
    }

    /// Take stderr for forwarding diagnostics.
    pub fn take_stderr(&mut self) -> Option<std::process::ChildStderr> {
        self.child.stderr.take()
    }

    /// Whether the child process is still running (has not exited).
    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// Grace period to wait for the host to exit on its own before force-killing.
    const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

    /// Close stdin (signals the host to shut down) and wait for the child,
    /// force-killing it if it doesn't exit within the grace period.
    ///
    /// Closing stdin alone is not a guaranteed exit signal — if the host is
    /// parked scanning for the game and ignores the `stop`/EOF, an unbounded
    /// `wait()` here would hang the patcher thread forever and leave the UI
    /// stuck "running". The grace-then-kill keeps shutdown bounded.
    pub fn shutdown(&mut self) {
        drop(self.child.stdin.take());

        let deadline = Instant::now() + Self::SHUTDOWN_GRACE;
        loop {
            match self.child.try_wait() {
                Ok(Some(status)) => {
                    tracing::info!("Host {} exited with {}", self.exe_path.display(), status);
                    return;
                }
                Ok(None) => {
                    if Instant::now() >= deadline {
                        tracing::warn!(
                            "Host {} did not exit within {:?}; killing",
                            self.exe_path.display(),
                            Self::SHUTDOWN_GRACE
                        );
                        self.kill();
                        return;
                    }
                    thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    tracing::warn!("Failed to wait for host process: {}", e);
                    return;
                }
            }
        }
    }

    /// Kill the host process immediately.
    pub fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

// ---------------------------------------------------------------------------
// Persistent host
// ---------------------------------------------------------------------------

/// A line forwarded from the host's stdout: `Ok(line)` for a full line, `Err`
/// for a read error or (implicitly, via channel disconnect) EOF.
pub type HostLine = std::io::Result<String>;

/// A long-lived injection host, kept alive across patching sessions.
///
/// Killing the host between sessions would tear down the elevated worker it
/// bridges to (and re-trigger its UAC prompt on the next start), so instead we
/// spawn it once — lazily, on the first patcher start — and drive it with
/// `start`/`stop` commands. A single reader thread owns the host's stdout for
/// its whole life and funnels every line onto [`Self::take_events`]'s channel;
/// each session borrows that receiver for the duration of its event loop and
/// hands it back via [`Self::restore_events`].
pub struct PatcherHost {
    proc: HostProcess,
    /// Receiver for the persistent reader thread's lines. `None` while a session
    /// has borrowed it (see [`Self::take_events`]).
    events: Option<Receiver<HostLine>>,
    reader_handle: Option<JoinHandle<()>>,
    stderr_handle: Option<JoinHandle<()>>,
    /// Whether the host was spawned with `--elevate`. A change in the desired
    /// elevation mode forces a respawn (the flag is fixed at spawn time).
    elevated: bool,
}

impl PatcherHost {
    /// Spawn the host and start its persistent stdout reader thread.
    pub fn spawn(exe_path: &Path, elevate: bool) -> Result<Self, HostError> {
        let mut proc = HostProcess::spawn(exe_path, elevate)?;
        let stderr_handle = proc.take_stderr().map(forward_stderr);
        let reader = match proc.take_event_reader() {
            Some(reader) => reader,
            None => {
                // Piped stdout should always be present; if not, don't leak the child.
                proc.kill();
                return Err(HostError::StdoutClosed);
            }
        };

        let (tx, rx) = mpsc::channel::<HostLine>();
        let reader_handle = thread::spawn(move || {
            for line in reader.lines() {
                let is_err = line.is_err();
                // Stop on a send failure (receiver gone) or the first read error;
                // EOF ends `lines()` naturally and drops `tx`, disconnecting the
                // channel so the consuming session observes the host's exit.
                if tx.send(line).is_err() || is_err {
                    break;
                }
            }
        });

        Ok(Self {
            proc,
            events: Some(rx),
            reader_handle: Some(reader_handle),
            stderr_handle,
            elevated: elevate,
        })
    }

    /// Whether the host process is still running.
    pub fn is_alive(&mut self) -> bool {
        self.proc.is_alive()
    }

    /// Whether the host was spawned with `--elevate`.
    pub fn elevated(&self) -> bool {
        self.elevated
    }

    /// Whether the host still holds its event stream. A live host that lost it (a
    /// session panicked between [`Self::take_events`] and [`Self::restore_events`])
    /// is wedged and must be respawned, not reused.
    pub fn has_event_stream(&self) -> bool {
        self.events.is_some()
    }

    /// Send all config commands for a session.
    pub fn configure(&mut self, config: &HostConfig) -> Result<(), HostError> {
        self.proc.configure(config)
    }

    /// Begin a scan session.
    pub fn start_scan(&mut self) -> Result<(), HostError> {
        self.proc.start_scan()
    }

    /// Tear down the current injection session, leaving the host running.
    pub fn stop_session(&mut self) -> Result<(), HostError> {
        self.proc.stop_session()
    }

    /// Discard any buffered lines left over from a previous session (e.g. the
    /// trailing `ok stop` after the last stop) so a new session's event loop
    /// starts clean.
    pub fn drain_events(&mut self) {
        if let Some(rx) = &self.events {
            while rx.try_recv().is_ok() {}
        }
    }

    /// Borrow the host's line stream for the duration of a session. Returns
    /// `None` if a session already holds it (shouldn't happen — only one runs at
    /// a time).
    pub fn take_events(&mut self) -> Option<Receiver<HostLine>> {
        self.events.take()
    }

    /// Hand the line stream back after a session ends, so the next one can reuse
    /// this host.
    pub fn restore_events(&mut self, events: Receiver<HostLine>) {
        self.events = Some(events);
    }

    /// Gracefully stop the host: close stdin (with a kill fallback) and join the
    /// reader/stderr threads. For app shutdown / respawn.
    pub fn shutdown(&mut self) {
        self.proc.shutdown();
        if let Some(h) = self.reader_handle.take() {
            let _ = h.join();
        }
        if let Some(h) = self.stderr_handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for PatcherHost {
    fn drop(&mut self) {
        // Safety net: if the app exits without an explicit `shutdown`, `Child`'s
        // own `Drop` would leak the process. Kill it so the host never outlives us.
        self.proc.kill();
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

/// Forward the host's stderr on a background thread for startup diagnostics.
fn forward_stderr<R: Read + Send + 'static>(stream: R) -> JoinHandle<()> {
    thread::spawn(move || {
        for line in BufReader::new(stream).lines() {
            match line {
                Ok(text) if !text.trim().is_empty() => {
                    tracing::warn!("[ltk-host stderr] {}", text);
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patcher_host_state_defaults_to_empty() {
        let state = PatcherHostState::default();
        assert!(
            state.0.lock().unwrap().is_none(),
            "no host until the first patcher start spawns one (lazy start)"
        );
    }

    #[test]
    fn parse_ok_event() {
        let event = parse_event("ok 12.3456789 config prefix set").unwrap();
        match event {
            HostEvent::Ok {
                timestamp, message, ..
            } => {
                assert_eq!(timestamp, "12.3456789");
                assert_eq!(message, "config prefix set");
            }
            _ => panic!("Expected Ok event"),
        }
    }

    #[test]
    fn parse_status_event() {
        let event = parse_event("status 0.0012345 injecting scanning for game").unwrap();
        match event {
            HostEvent::Status {
                timestamp,
                state,
                message,
                ..
            } => {
                assert_eq!(timestamp, "0.0012345");
                assert_eq!(state, HostState::Injecting);
                assert_eq!(message, "scanning for game");
            }
            _ => panic!("Expected Status event"),
        }
    }

    #[test]
    fn parse_error_event() {
        let event = parse_event("error 5.0000000 unknown command").unwrap();
        match event {
            HostEvent::Error {
                timestamp, message, ..
            } => {
                assert_eq!(timestamp, "5.0000000");
                assert_eq!(message, "unknown command");
            }
            _ => panic!("Expected Error event"),
        }
    }

    #[test]
    fn parse_dll_log_event() {
        let event = parse_event(
            "dll 10.1234567 1234 5678 info ltk_patcher_dll::hook: redirected wad: DATA/Champions/Ahri.wad.client",
        )
        .unwrap();
        match event {
            HostEvent::DllLog {
                timestamp,
                pid,
                tid,
                level,
                message,
            } => {
                assert_eq!(timestamp, "10.1234567");
                assert_eq!(pid, 1234);
                assert_eq!(tid, 5678);
                assert_eq!(level, "info");
                assert_eq!(
                    message,
                    "ltk_patcher_dll::hook: redirected wad: DATA/Champions/Ahri.wad.client"
                );
            }
            _ => panic!("Expected DllLog event"),
        }
    }

    #[test]
    fn parse_dll_uppercase_level_keeps_message_intact() {
        // Real host output uses uppercase level keywords; the level must be split
        // off so the scan-failure phrase survives verbatim in `message`.
        let event = parse_event(
            "dll 64.6055036 11776 24292 ERROR ltk_patcher_dll::verify: WAD scan failed status with c0000229 for briar.wad.client",
        )
        .unwrap();
        match event {
            HostEvent::DllLog {
                pid,
                tid,
                level,
                message,
                ..
            } => {
                assert_eq!(pid, 11776);
                assert_eq!(tid, 24292);
                assert_eq!(level, "ERROR");
                assert_eq!(
                    message,
                    "ltk_patcher_dll::verify: WAD scan failed status with c0000229 for briar.wad.client"
                );
            }
            _ => panic!("Expected DllLog event"),
        }
    }

    #[test]
    fn parse_status_failed() {
        let event =
            parse_event("status 60.0000000 failed DLL never attached after 60s -- check the DLL signature / antivirus")
                .unwrap();
        match event {
            HostEvent::Status { state, message, .. } => {
                assert_eq!(state, HostState::Failed);
                assert!(message.contains("DLL never attached"));
            }
            _ => panic!("Expected Status event"),
        }
    }

    #[test]
    fn parse_empty_line_returns_none() {
        assert!(parse_event("").is_none());
        assert!(parse_event("\r\n").is_none());
    }

    #[test]
    fn parse_unknown_keyword_returns_none() {
        assert!(parse_event("foobar 1.0 something").is_none());
    }

    #[test]
    fn split_first_token_works() {
        assert_eq!(split_first_token("hello world"), ("hello", "world"));
        assert_eq!(split_first_token("single"), ("single", ""));
        assert_eq!(split_first_token("  spaced  out  "), ("spaced", "out  "));
        assert_eq!(split_first_token(""), ("", ""));
    }

    #[test]
    fn host_state_parse_all_variants() {
        assert_eq!(HostState::parse("injecting"), Some(HostState::Injecting));
        assert_eq!(HostState::parse("injected"), Some(HostState::Injected));
        assert_eq!(HostState::parse("waiting"), Some(HostState::Waiting));
        assert_eq!(HostState::parse("exited"), Some(HostState::Exited));
        assert_eq!(HostState::parse("failed"), Some(HostState::Failed));
        assert_eq!(HostState::parse("unknown"), None);
    }
}
