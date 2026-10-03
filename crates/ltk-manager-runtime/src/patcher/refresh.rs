//! A library edit the running session's overlay has not caught up with.

use std::time::{Duration, Instant};

use parking_lot::Mutex;

/// How long a request waits for another edit, so a burst of edits costs one rebuild.
const SETTLE: Duration = Duration::from_millis(750);

/// The running session's pending overlay rebuild, requested by a library edit and
/// taken by the session thread between games.
#[derive(Debug, Default)]
pub struct OverlayRefresh(Mutex<Pending>);

#[derive(Debug, Default)]
struct Pending {
    requested_at: Option<Instant>,
    after_game: bool,
}

impl OverlayRefresh {
    /// Ask for a rebuild, restarting the settle window.
    pub fn request(&self) {
        self.request_at(Instant::now());
    }

    fn request_at(&self, at: Instant) {
        self.0.lock().requested_at = Some(at);
    }

    /// Whether a request has gone [`SETTLE`] without another edit.
    pub fn is_due(&self, now: Instant) -> bool {
        self.0
            .lock()
            .requested_at
            .is_some_and(|at| now.saturating_duration_since(at) >= SETTLE)
    }

    /// Hold a due request until the game ends. Whether it was not held already.
    pub fn defer_to_game_end(&self) -> bool {
        let mut pending = self.0.lock();
        !std::mem::replace(&mut pending.after_game, true)
    }

    /// Whether a request waits for the running game to end.
    pub fn waits_for_game(&self) -> bool {
        self.0.lock().after_game
    }

    /// Drop the request, as a build is about to read the library it asked about.
    pub fn clear(&self) {
        *self.0.lock() = Pending::default();
    }
}

#[cfg(test)]
mod tests;
