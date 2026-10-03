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
    WwisePackage,
}

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
            WorkshopFileKind::WwisePackage => Self::WwisePackage,
        }
    }
}
