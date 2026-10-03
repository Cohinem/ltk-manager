//! What the mod library announces, and the values those announcements carry.

use serde::{Deserialize, Serialize};

use crate::game_build::GameBuild;

/// Where a mod's content is, which is what picks its content provider.
///
/// Recorded rather than derived: a fantome installs as
/// [`Archive`](Self::Archive) but the user can unpack it after the fact, and a
/// future sanitized-fantome mode would be another value here rather than
/// another guess from the layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "lowercase")]
pub enum ModStorage {
    /// An unpacked mod project: `mod.config.json` plus a `content/` tree.
    #[default]
    Project,
    /// Inside the mod's archive, which the provider reads without unpacking.
    Archive,
}

/// What a check ran against, and therefore what makes an old one stale.
///
/// Per "The basis" in docs/ux/MOD_HEALTH.md.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct HealthCheckBasis {
    /// The installed game build, absent where none could be read.
    #[cfg_attr(feature = "ts", specta(type = Option<String>))]
    pub build: Option<GameBuild>,
    /// The manager version, which is what a migration table ships in.
    pub manager: String,
    /// What the shared hashtable cache held, absent where it held nothing.
    ///
    /// The cache's own generation stamp, which moves only when a sync installs
    /// a table. A check taken against different tables was a claim about
    /// different names, so a sync makes every verdict due again without waiting
    /// for a game patch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", specta(optional))]
    pub tables: Option<String>,
    /// What the meta schema database held, absent where none was open.
    ///
    /// It decides `bin/property-type` outright, so a check taken against
    /// another database was a claim about other types. The database's own bytes
    /// rather than the stamp it carries, because the publisher restamps the
    /// hash tables behind it on a schedule of its own - a database that has
    /// gained two patches can still carry the stamp it was first published
    /// under.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", specta(optional))]
    pub schema: Option<String>,
}

/// What one library sweep concluded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct HealthSweepReport {
    /// What the sweep checked against.
    pub basis: HealthCheckBasis,
    /// Mods this run recorded a fresh verdict for.
    pub checked: usize,
    /// Checkable mods this run did not take.
    pub skipped: usize,
    /// Every mod in the library a repair would fix, by id.
    pub repairable: Vec<String>,
    /// Every mod in the library with findings and no fix for any, by id.
    pub unrepairable: Vec<String>,
}

/// One mod the migration could not convert.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct FailedConversion {
    /// The mod's index id, which is also the directory the uuid layout gave it.
    pub id: String,
    /// What to call the mod in the failure list, falling back to its id.
    pub display_name: String,
    /// Why it could not be moved, in the words the user reads.
    pub error: String,
}

/// What one migration run did.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct LayoutMigrationReport {
    /// How many mods reached the slug layout.
    pub migrated: usize,
    /// The mods that did not, each naming where its files went instead.
    pub failed: Vec<FailedConversion>,
}
