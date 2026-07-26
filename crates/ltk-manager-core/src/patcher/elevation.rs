//! Whether an injection host needs the UAC bridge.

use crate::config::Config;
use crate::diagnostics;

/// Whether to spawn the host with `--elevate`.
///
/// Probes the running system, so it can only be called for real; the rule
/// itself is [`elevation_decision`].
pub fn should_elevate(config: &Config) -> bool {
    let manager_elevated = diagnostics::manager_is_elevated();
    let league_admin = diagnostics::league_configured_as_admin();
    let should_elevate =
        elevation_decision(config.elevate_injector, league_admin, manager_elevated);
    tracing::info!(
        "Injector elevation = {should_elevate} (opt_in={}, league_admin={league_admin}, manager_elevated={manager_elevated})",
        config.elevate_injector
    );
    should_elevate
}

/// Elevate when the user opts in or League runs as admin, but never when the
/// manager is already elevated: a host it spawns inherits high integrity, so the
/// UAC bridge would only add a redundant prompt.
fn elevation_decision(opt_in: bool, league_admin: bool, manager_elevated: bool) -> bool {
    !manager_elevated && (opt_in || league_admin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unelevated_manager_elevates_on_opt_in_or_an_admin_league() {
        assert!(!elevation_decision(false, false, false));
        assert!(elevation_decision(true, false, false));
        assert!(elevation_decision(false, true, false));
        assert!(elevation_decision(true, true, false));
    }

    /// An elevated manager already spawns high-integrity hosts, so the bridge
    /// would only cost the user a second UAC prompt for nothing.
    #[test]
    fn an_elevated_manager_never_elevates_the_host() {
        for opt_in in [false, true] {
            for league_admin in [false, true] {
                assert!(
                    !elevation_decision(opt_in, league_admin, true),
                    "opt_in={opt_in} league_admin={league_admin}"
                );
            }
        }
    }
}
