//! What kind of file an asset is, as it crosses IPC.

use ltk_file::LeagueFileKind;
use serde::{Deserialize, Serialize};

/// Mirror of [`ltk_file::LeagueFileKind`] with `ts-rs` bindings. Kept in sync
/// manually — the upstream enum is small and stable, and mirroring lets us
/// export a TypeScript union without fighting external crate attributes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum WorkshopFileKind {
    Animation,
    /// A layer's game data declarations manifest, which [`LeagueFileKind`] has no kind for.
    GameData,
    Jpeg,
    LightGrid,
    LuaObj,
    MapGeometry,
    Png,
    Tga,
    Preload,
    PropertyBin,
    PropertyBinOverride,
    RiotStringTable,
    SimpleSkin,
    Skeleton,
    StaticMeshAscii,
    StaticMeshBinary,
    Svg,
    Texture,
    TextureDds,
    Unknown,
    WorldGeometry,
    WwiseBank,
    /// A WEM media file, which [`LeagueFileKind`] has no kind for.
    WwiseMedia,
    WwisePackage,
}

impl WorkshopFileKind {
    /// Returns the kind that the file extension `extension` names, without the dot.
    #[must_use]
    pub fn from_extension(extension: &str) -> Self {
        if extension.eq_ignore_ascii_case(WEM_EXTENSION) {
            return Self::WwiseMedia;
        }
        LeagueFileKind::from_extension(extension).into()
    }

    /// Returns the kind of the file whose first bytes are `bytes` and whose name gives `named`.
    ///
    /// A file whose name gives [`WorkshopFileKind::Unknown`] is read from its signature, and a
    /// RIFF `WAVE` file is a [`WorkshopFileKind::WwiseMedia`].
    #[must_use]
    pub fn or_signature(named: Self, bytes: &[u8]) -> Self {
        if named == Self::Unknown && is_riff_wave(bytes) {
            return Self::WwiseMedia;
        }
        named
    }
}

/// Returns `true` if `bytes` start with a RIFF header of the form type `WAVE`.
fn is_riff_wave(bytes: &[u8]) -> bool {
    bytes.get(..4) == Some(b"RIFF") && bytes.get(8..12) == Some(b"WAVE")
}

/// The extension of a WEM media file.
const WEM_EXTENSION: &str = "wem";

impl From<LeagueFileKind> for WorkshopFileKind {
    fn from(value: LeagueFileKind) -> Self {
        match value {
            LeagueFileKind::Animation => Self::Animation,
            LeagueFileKind::Jpeg => Self::Jpeg,
            LeagueFileKind::LightGrid => Self::LightGrid,
            LeagueFileKind::LuaObj => Self::LuaObj,
            LeagueFileKind::MapGeometry => Self::MapGeometry,
            LeagueFileKind::Png => Self::Png,
            LeagueFileKind::Tga => Self::Tga,
            LeagueFileKind::Preload => Self::Preload,
            LeagueFileKind::PropertyBin => Self::PropertyBin,
            LeagueFileKind::PropertyBinOverride => Self::PropertyBinOverride,
            LeagueFileKind::RiotStringTable => Self::RiotStringTable,
            LeagueFileKind::SimpleSkin => Self::SimpleSkin,
            LeagueFileKind::Skeleton => Self::Skeleton,
            LeagueFileKind::StaticMeshAscii => Self::StaticMeshAscii,
            LeagueFileKind::StaticMeshBinary => Self::StaticMeshBinary,
            LeagueFileKind::Svg => Self::Svg,
            LeagueFileKind::Texture => Self::Texture,
            LeagueFileKind::TextureDds => Self::TextureDds,
            LeagueFileKind::Unknown => Self::Unknown,
            LeagueFileKind::WorldGeometry => Self::WorldGeometry,
            LeagueFileKind::WwiseBank => Self::WwiseBank,
            LeagueFileKind::WwisePackage => Self::WwisePackage,
        }
    }
}

impl From<WorkshopFileKind> for LeagueFileKind {
    fn from(value: WorkshopFileKind) -> Self {
        match value {
            WorkshopFileKind::Animation => Self::Animation,
            WorkshopFileKind::GameData => Self::Unknown,
            WorkshopFileKind::Jpeg => Self::Jpeg,
            WorkshopFileKind::LightGrid => Self::LightGrid,
            WorkshopFileKind::LuaObj => Self::LuaObj,
            WorkshopFileKind::MapGeometry => Self::MapGeometry,
            WorkshopFileKind::Png => Self::Png,
            WorkshopFileKind::Tga => Self::Tga,
            WorkshopFileKind::Preload => Self::Preload,
            WorkshopFileKind::PropertyBin => Self::PropertyBin,
            WorkshopFileKind::PropertyBinOverride => Self::PropertyBinOverride,
            WorkshopFileKind::RiotStringTable => Self::RiotStringTable,
            WorkshopFileKind::SimpleSkin => Self::SimpleSkin,
            WorkshopFileKind::Skeleton => Self::Skeleton,
            WorkshopFileKind::StaticMeshAscii => Self::StaticMeshAscii,
            WorkshopFileKind::StaticMeshBinary => Self::StaticMeshBinary,
            WorkshopFileKind::Svg => Self::Svg,
            WorkshopFileKind::Texture => Self::Texture,
            WorkshopFileKind::TextureDds => Self::TextureDds,
            WorkshopFileKind::Unknown => Self::Unknown,
            WorkshopFileKind::WorldGeometry => Self::WorldGeometry,
            WorkshopFileKind::WwiseBank => Self::WwiseBank,
            WorkshopFileKind::WwiseMedia => Self::Unknown,
            WorkshopFileKind::WwisePackage => Self::WwisePackage,
        }
    }
}

#[cfg(test)]
mod tests;
