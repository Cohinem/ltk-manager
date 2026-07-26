//! The overlay build itself, with nothing else attached.
//!
//! Everything the build needs arrives in [`OverlayBuildInputs`] and everything
//! it learns leaves in [`OverlayBuildOutcome`]. Nothing here reads settings,
//! touches the library index, or announces anything — the caller resolved the
//! inputs and the caller decides what to do with the results. That is what lets
//! a CLI reuse this: it can supply its own mod list and print the offenders
//! instead of persisting them for a badge UI.

use crate::error::{AppError, AppResult};
use camino::Utf8PathBuf;
use ltk_manager_core::events::{OverlayProgress, OverlayStage};

/// Everything a build needs, resolved by the caller.
pub struct OverlayBuildInputs {
    /// The `Game/` directory holding the WADs to patch.
    pub game_dir: Utf8PathBuf,
    /// Where patched WADs are written — the prefix the patcher is pointed at.
    pub overlay_root: Utf8PathBuf,
    /// Where the builder keeps its caches (`overlay.json`, `game_index.bin`, …).
    pub state_dir: Utf8PathBuf,
    /// WAD filenames to leave untouched, already expanded and deduped.
    pub blocked_wads: Vec<String>,
    /// Which locales string overrides apply to.
    pub string_override_mode: ltk_overlay::StringOverrideMode,
    /// Mods to apply, in ascending priority order.
    pub mods: Vec<ltk_overlay::EnabledMod>,
}

/// What a build found, for the caller to persist or report as it sees fit.
pub struct OverlayBuildOutcome {
    /// Mods whose property-bins reference linked dependencies that don't resolve
    /// against the overlay WADs they land in.
    ///
    /// This is a property of the *build*, not of any one mod: another enabled mod
    /// can supply the missing dependency, so the same mod can be an offender in
    /// one build and clean in the next.
    pub linked_bin_offenders: Vec<ltk_overlay::LinkedBinOffender>,
    /// Per-mod WAD footprints, a byproduct of the same pass.
    pub mod_wad_reports: Vec<ltk_overlay::ModWadReport>,
}

/// Build the overlay described by `inputs`, reporting progress through `progress`.
///
/// `progress` is invoked once per file during patching, so it must be cheap.
pub fn build_overlay(
    inputs: OverlayBuildInputs,
    progress: impl Fn(OverlayProgress) + Send + Sync + 'static,
) -> AppResult<OverlayBuildOutcome> {
    let OverlayBuildInputs {
        game_dir,
        overlay_root,
        state_dir,
        blocked_wads,
        string_override_mode,
        mods,
    } = inputs;

    let mut builder = ltk_overlay::OverlayBuilder::new(game_dir, overlay_root, state_dir)
        .with_blocked_wads(blocked_wads)
        .with_string_overrides(string_override_mode)
        .with_progress(move |p| progress(translate_progress(p)));

    builder.set_enabled_mods(mods);

    builder
        .build()
        .map_err(|e| AppError::Other(format!("Overlay build failed: {}", e)))?;

    Ok(OverlayBuildOutcome {
        linked_bin_offenders: builder.take_linked_bin_offenders(),
        mod_wad_reports: builder.take_mod_wad_reports(),
    })
}

/// Map the builder's progress into the shape the frontend listens for.
fn translate_progress(progress: ltk_overlay::OverlayProgress) -> OverlayProgress {
    let stage = match progress.stage {
        ltk_overlay::OverlayStage::Indexing => OverlayStage::Indexing,
        ltk_overlay::OverlayStage::CollectingOverrides => OverlayStage::Collecting,
        ltk_overlay::OverlayStage::PatchingWad => OverlayStage::Patching,
        ltk_overlay::OverlayStage::ApplyingStringOverrides => OverlayStage::Strings,
        ltk_overlay::OverlayStage::Complete => OverlayStage::Complete,
    };
    OverlayProgress {
        stage,
        current_file: progress.current_file,
        current: progress.current,
        total: progress.total,
    }
}
