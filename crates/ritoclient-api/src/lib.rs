//! A client for the Riot Client's local API.
//!
//! The Riot Client runs a loopback HTTPS server whose port and password live in
//! a lockfile only the current user can read. Everything here talks to that
//! server, or to the on-disk records it maintains ([`installs`]), or to the
//! process table ([`processes`]).
//!
//! # What this crate deliberately does not do
//!
//! - **It never spawns `LeagueClient.exe`.** That executable's argv carries an
//!   `rso_auth.authorization-key` blob only an authenticated Riot Client can
//!   mint, so any design that starts the game directly is wrong regardless of
//!   how tempting the process tree makes it look.
//! - **It never touches `/rso-auth`, `/rso-authenticator`, `/player-account`,
//!   `/entitlements` or `/payments`.** Those are the credential surfaces. Out of
//!   scope permanently.
//! - **It never writes.** The one exception is [`launch`], which asks the client
//!   to start a product. Routes that rewrite client state - notably
//!   `PUT …/root-path`, which moves where the client thinks a game is installed
//!   - are not wrapped here on purpose.
//!
//! # Layout
//!
//! | Module | Talks to |
//! | --- | --- |
//! | [`installs`] | `RiotClientInstalls.json` on disk |
//! | [`lockfile`] | the remoting lockfile on disk |
//! | [`processes`] | the Windows process table |
//! | [`product_launcher`] | `/product-launcher/v1` - starting a product |
//! | [`product_registry`] | `/rnet-product-registry/v4` - what is installed, and where |
//! | [`app_args`] | `/riotclientapp/v1` - the argv handoff, used only to wake a tray-idle client |
//! | [`launch`] | orchestration: pick a route and drive it |
//!
//! Launching is Windows-only; everything else compiles everywhere, and the
//! platform-specific entry points return [`LauncherError::UnsupportedPlatform`]
//! or an empty result rather than failing to build.

pub mod app_args;
pub mod error;
pub mod http;
pub mod installs;
pub mod launch;
pub mod lifecycle;
pub mod lockfile;
pub mod processes;
pub mod product_launcher;
pub mod product_registry;
pub mod progress;

#[cfg(target_os = "windows")]
mod spawn;
mod window;

pub use error::LauncherError;
pub use installs::{RiotClientInstalls, default_installs_path, resolve_riot_client};
pub use launch::{
    LaunchAvailability, LaunchOutcome, LaunchRoute, LaunchTarget, launch_availability,
    launch_league,
};
pub use lockfile::{Lockfile, default_lockfile_path, live_lockfile};
pub use product_registry::{LEAGUE_PRODUCT_ID, Patchline, Product};
pub use progress::{LaunchObserver, LaunchProgress, LaunchStage, NullObserver};
