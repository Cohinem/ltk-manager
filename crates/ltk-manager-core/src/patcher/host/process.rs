//! Spawning and driving a single injection-host child process.

use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use super::protocol::{HostConfig, proto};

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

    /// Send one `config <key> <value>` command.
    fn send_config(&mut self, key: &str, value: impl std::fmt::Display) -> Result<(), HostError> {
        self.send_command(&format!("{} {} {}", proto::CMD_CONFIG, key, value))
    }

    /// Send all config commands derived from a `HostConfig`.
    pub fn configure(&mut self, config: &HostConfig) -> Result<(), HostError> {
        self.send_config(proto::CONFIG_LOGLEVEL, config.log_level as u32)?;
        self.send_config(proto::CONFIG_FLAGS, config.flags)?;
        self.send_config(proto::CONFIG_PREFIX, &config.prefix)
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
    /// This consumes the stdout handle - call once.
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
    /// Closing stdin alone is not a guaranteed exit signal - if the host is
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
