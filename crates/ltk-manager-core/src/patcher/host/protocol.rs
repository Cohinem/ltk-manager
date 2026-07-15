//! The wire protocol spoken with the injection host: command/event keywords,
//! session configuration, and parsing of host→UI event lines.

/// Protocol keywords shared by command building and event parsing.
pub(super) mod proto {
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

/// Hook flag bits forwarded to the host via `config flags <N>`
pub mod hook_flags {
    /// `CSLOL_HOOK_DISABLE_VERIFY` - skip the signature-verification bypass,
    /// leaving the game's own file verification intact.
    pub const DISABLE_VERIFY: u32 = 1;
    /// `CSLOL_HOOK_DISABLE_FILE` - disable the filesystem overlay, so no modded
    /// files are redirected into the game.
    pub const DISABLE_FILE: u32 = 2;
    /// `CSLOL_HOOK_OPT_OUT_AH_V1` - opt out of anti-skinhack v1 enforcement: a
    /// failed WAD scan is downgraded from a blocking error to a warning, so
    /// patching proceeds instead of aborting.
    pub const OPT_OUT_AH_V1: u32 = 4;
}

/// DLL log verbosity, sent via `config loglevel <N>`.
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostLogLevel {
    Error = 0,
    Info = 0x10,
    Debug = 0x20,
    All = 0x1000,
}

/// Configuration sent to the host before starting a session.
#[derive(Debug, Clone)]
pub struct HostConfig {
    /// Overlay prefix path (the overlay root directory, with trailing separator).
    pub prefix: String,
    /// DLL log level.
    pub log_level: HostLogLevel,
    /// Hook flags bitmask (see [`hook_flags`]; `0` = full functionality).
    pub flags: u32,
}

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

#[cfg(test)]
mod tests {
    use super::*;

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
