//! Layer files a change on disk touched, named the way a layer asset reference names them.

use std::collections::BTreeSet;
use std::path::{Component, Path};

use serde::Serialize;

/// One file of one project layer, as [`AssetRef::Layer`](crate::preview::AssetRef::Layer) names it.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LayerFile {
    /// The layer's directory name under `content`.
    pub layer: String,
    /// Path relative to the layer root, with forward slashes.
    pub path: String,
}

impl LayerFile {
    /// The layer file `path` names under the `content` directory, or `None` outside a layer.
    ///
    /// The layer directory itself is no file of the layer. Neither is a path that does not
    /// read as UTF-8, which no asset reference carries.
    #[must_use]
    pub fn at(content: &Path, path: &Path) -> Option<Self> {
        let mut parts = path
            .strip_prefix(content)
            .ok()?
            .components()
            .map(|part| match part {
                Component::Normal(name) => name.to_str(),
                _ => None,
            });

        let layer = parts.next()??;
        let rest = parts.collect::<Option<Vec<_>>>()?;
        if rest.is_empty() {
            return None;
        }

        Some(Self {
            layer: layer.to_owned(),
            path: rest.join("/"),
        })
    }
}

/// Layer files of one workshop project that changed on disk.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LayerFilesChanged {
    /// The project directory, spelled as the watch on it was asked for.
    pub project: String,
    /// Each file once, in order.
    pub files: Vec<LayerFile>,
}

impl LayerFilesChanged {
    /// The layer files among `paths` under `content`, or `None` where no path names one.
    #[must_use]
    pub fn collect<'a>(
        project: &str,
        content: &Path,
        paths: impl IntoIterator<Item = &'a Path>,
    ) -> Option<Self> {
        let files: BTreeSet<LayerFile> = paths
            .into_iter()
            .filter_map(|path| LayerFile::at(content, path))
            .collect();
        if files.is_empty() {
            return None;
        }

        Some(Self {
            project: project.to_owned(),
            files: files.into_iter().collect(),
        })
    }
}

#[cfg(test)]
mod tests;
