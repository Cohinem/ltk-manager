//! The long-lived injection host, kept alive across patching sessions.

use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::thread::{self, JoinHandle};

use super::process::{HostError, HostProcess};
use super::protocol::HostConfig;

/// A line forwarded from the host's stdout: `Ok(line)` for a full line, `Err`
/// for a read error or (implicitly, via channel disconnect) EOF.
pub type HostLine = std::io::Result<String>;

/// A long-lived injection host, kept alive across patching sessions.
///
/// Killing the host between sessions would tear down the elevated worker it
/// bridges to (and re-trigger its UAC prompt on the next start), so instead we
/// spawn it once - lazily, on the first patcher start - and drive it with
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

    /// Discard buffered lines left over from a previous session and report
    /// whether the stream is still usable.
    ///
    /// Returns `false` if the receiver is missing (a session panicked while
    /// holding it) or disconnected (the reader thread died even though the
    /// process may still be alive) - reusing such a host would make every
    /// future session fail instantly, so it must be respawned.
    pub fn drain_events(&mut self) -> bool {
        let Some(rx) = &self.events else {
            return false;
        };
        loop {
            match rx.try_recv() {
                Ok(_) => {}
                Err(TryRecvError::Empty) => return true,
                Err(TryRecvError::Disconnected) => return false,
            }
        }
    }

    /// Borrow the host's line stream for the duration of a session. Returns
    /// `None` if a session already holds it (shouldn't happen - only one runs at
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
