use super::Workshop;
use super::layer;
use crate::error::{AppError, AppResult};
use ltk_file::LeagueFileKind;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// A project's content directory as a flat per-layer listing.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ContentTree {
    pub layers: Vec<LayerContent>,
}

/// The files inside a single layer directory.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LayerContent {
    pub name: String,
    pub file_count: usize,
    pub total_size_bytes: u64,
    pub entries: Vec<ContentEntry>,
}

/// A single file entry in a layer's content directory.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ContentEntry {
    /// Path relative to the layer root, always POSIX-style (`/`).
    pub relative_path: String,
    pub size_bytes: u64,
    pub kind: WorkshopFileKind,
}

/// Mirror of [`ltk_file::LeagueFileKind`] with `ts-rs` bindings. Kept in sync
/// manually — the upstream enum is small and stable, and mirroring lets us
/// export a TypeScript union without fighting external crate attributes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WorkshopFileKind {
    Animation,
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

impl Workshop {
    /// Walk the project's `content/` directory and return the per-layer file
    /// listing. Hidden files and symlinks are skipped. The frontend virtualizes
    /// rendering, so we return every file the project contains.
    pub fn get_project_content_tree(&self, project_path: &str) -> AppResult<ContentTree> {
        let project_dir = PathBuf::from(project_path);
        if !project_dir.exists() {
            return Err(AppError::ProjectNotFound(project_path.to_string()));
        }

        let content_dir = project_dir.join("content");
        if !content_dir.exists() {
            return Ok(ContentTree { layers: Vec::new() });
        }

        let layer_dirs = layer::dirs_in(&content_dir)?;

        let mut layers = Vec::with_capacity(layer_dirs.len());
        for layer_dir in &layer_dirs {
            let name = layer_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            layers.push(scan_layer(layer_dir, &name)?);
        }

        Ok(ContentTree { layers })
    }
}

/// Scan a single layer directory into a [`LayerContent`]. Returns every file
/// under the directory, recursively — no truncation.
fn scan_layer(layer_dir: &Path, name: &str) -> AppResult<LayerContent> {
    let mut entries: Vec<ContentEntry> = Vec::new();
    let mut total_size_bytes: u64 = 0;

    for dent in WalkDir::new(layer_dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            // The walk starts at the layer root itself; don't reject it even
            // if its temp-dir basename happens to begin with a dot.
            if e.depth() == 0 {
                return true;
            }
            e.file_name().to_str().is_some_and(|n| !n.starts_with('.'))
        })
    {
        let dent = match dent {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!(
                    "Skipping unreadable entry in {}: {}",
                    layer_dir.display(),
                    e
                );
                continue;
            }
        };

        if !dent.file_type().is_file() {
            continue;
        }

        let size_bytes = dent.metadata().map(|m| m.len()).unwrap_or(0);
        total_size_bytes += size_bytes;

        let relative_path = dent
            .path()
            .strip_prefix(layer_dir)
            .map(Path::to_path_buf)
            .unwrap_or_else(|_| dent.path().to_path_buf())
            .components()
            .filter_map(|c| c.as_os_str().to_str())
            .collect::<Vec<_>>()
            .join("/");

        let extension = dent
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let kind = WorkshopFileKind::from(LeagueFileKind::from_extension(extension));

        entries.push(ContentEntry {
            relative_path,
            size_bytes,
            kind,
        });
    }

    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(LayerContent {
        name: name.to_string(),
        file_count: entries.len(),
        total_size_bytes,
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::NullEventSink;
    use std::fs;
    use std::sync::Arc;

    fn touch(path: &Path, contents: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn scan_layer_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let layer = scan_layer(dir.path(), "base").unwrap();
        assert_eq!(layer.file_count, 0);
        assert_eq!(layer.total_size_bytes, 0);
        assert!(layer.entries.is_empty());
    }

    #[test]
    fn scan_layer_classifies_known_extensions() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("assets/tex/skin.dds"), b"DDS content");
        touch(&dir.path().join("data/config.bin"), b"bin content");
        touch(&dir.path().join("mystery.xyz"), b"?");

        let layer = scan_layer(dir.path(), "base").unwrap();
        assert_eq!(layer.entries.len(), 3);

        let by_path: std::collections::HashMap<_, _> = layer
            .entries
            .iter()
            .map(|e| (e.relative_path.clone(), e.kind))
            .collect();
        assert!(matches!(
            by_path["assets/tex/skin.dds"],
            WorkshopFileKind::TextureDds
        ));
        assert!(matches!(
            by_path["data/config.bin"],
            WorkshopFileKind::PropertyBin
        ));
        assert!(matches!(by_path["mystery.xyz"], WorkshopFileKind::Unknown));
    }

    #[test]
    fn scan_layer_skips_dotfiles() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join(".DS_Store"), b"junk");
        touch(&dir.path().join("visible.png"), b"png");

        let layer = scan_layer(dir.path(), "base").unwrap();
        assert_eq!(layer.entries.len(), 1);
        assert_eq!(layer.entries[0].relative_path, "visible.png");
    }

    #[test]
    fn scan_layer_returns_every_file() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..50 {
            touch(&dir.path().join(format!("file_{i}.bin")), b"xx");
        }

        let layer = scan_layer(dir.path(), "base").unwrap();
        assert_eq!(layer.file_count, 50);
        assert_eq!(layer.entries.len(), 50);
        assert_eq!(layer.total_size_bytes, 100);
    }

    #[test]
    fn scan_layer_sorts_entries_by_path() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("z.bin"), b"");
        touch(&dir.path().join("a.bin"), b"");
        touch(&dir.path().join("m/n.bin"), b"");

        let layer = scan_layer(dir.path(), "base").unwrap();
        let paths: Vec<_> = layer
            .entries
            .iter()
            .map(|e| e.relative_path.as_str())
            .collect();
        assert_eq!(paths, vec!["a.bin", "m/n.bin", "z.bin"]);
    }

    #[test]
    fn content_tree_orders_base_first() {
        let project_dir = tempfile::tempdir().unwrap();
        let content = project_dir.path().join("content");
        fs::create_dir_all(content.join("zeta")).unwrap();
        fs::create_dir_all(content.join("alpha")).unwrap();
        fs::create_dir_all(content.join("base")).unwrap();
        touch(&content.join("base/a.bin"), b"");
        touch(&content.join("alpha/a.bin"), b"");
        touch(&content.join("zeta/a.bin"), b"");

        let workshop = Workshop::new(Arc::new(NullEventSink));
        let tree = workshop
            .get_project_content_tree(project_dir.path().to_str().unwrap())
            .unwrap();

        let names: Vec<&str> = tree.layers.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(names, ["base", "alpha", "zeta"]);
    }
}
