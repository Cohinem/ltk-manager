//! A mod project's layers: what one is, and how a listing reads them.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use fs_err as fs;
use ltk_mod_project::ModProjectLayer;

use crate::error::AppResult;
use crate::utils::natural_order::compare_names;

/// One layer of a mod project, as much of it as a listing needs.
///
/// A layer reaches a listing as a [`ModProjectLayer`] out of a project or a
/// `.fantome`, and as an inspected `.modpkg`'s own shape. Both order the same.
pub trait Layer {
    /// The layer's directory name, unique within a project.
    fn name(&self) -> &str;

    /// Higher priority wins where two layers write the same file.
    fn priority(&self) -> i32;

    /// Whether this is `base`, the layer every project has.
    fn is_base(&self) -> bool {
        self.name() == ModProjectLayer::BASE_NAME
    }

    /// Order against `other` the way every listing shows the two.
    ///
    /// `base` leads, because it is what the rest stack onto and nothing gives it
    /// the lowest priority. The others go by priority, and ties by name in
    /// natural order so `layer9` precedes `layer10`.
    fn cmp_for_display(&self, other: &Self) -> Ordering
    where
        Self: Sized,
    {
        other
            .is_base()
            .cmp(&self.is_base())
            .then_with(|| self.priority().cmp(&other.priority()))
            .then_with(|| compare_names(self.name(), other.name()))
    }
}

impl Layer for ModProjectLayer {
    fn name(&self) -> &str {
        &self.name
    }

    fn priority(&self) -> i32 {
        self.priority
    }
}

/// The layer directories under one content directory, `base` first.
///
/// Layers come from disk rather than from the project's config, so a layer a
/// user dropped in by hand is a layer that gets read.
///
/// # Errors
///
/// Fails when `content_dir` cannot be read.
pub fn dirs_in(content_dir: &Path) -> AppResult<Vec<PathBuf>> {
    let mut dirs: Vec<PathBuf> = fs::read_dir(content_dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter(|path| !dir_name(path).starts_with('.'))
        .collect();

    /* A directory carries no priority, so `base` leads and the rest go by name. */
    dirs.sort_by(|a, b| {
        let (a, b) = (dir_name(a), dir_name(b));
        let base = ModProjectLayer::BASE_NAME;
        (b == base)
            .cmp(&(a == base))
            .then_with(|| compare_names(a, b))
    });

    Ok(dirs)
}

fn dir_name(path: &Path) -> &str {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layer(name: &str, priority: i32) -> ModProjectLayer {
        ModProjectLayer {
            name: name.to_owned(),
            priority,
            ..Default::default()
        }
    }

    fn names(mut layers: Vec<ModProjectLayer>) -> Vec<String> {
        layers.sort_by(|a, b| a.cmp_for_display(b));
        layers.into_iter().map(|l| l.name).collect()
    }

    #[test]
    fn base_leads_whatever_its_priority_would_give_it() {
        let sorted = names(vec![layer("armor", 0), layer("base", 0), layer("aa", -5)]);
        assert_eq!(sorted, ["base", "aa", "armor"]);
    }

    #[test]
    fn the_rest_go_by_priority() {
        let sorted = names(vec![layer("late", 20), layer("early", 1), layer("base", 0)]);
        assert_eq!(sorted, ["base", "early", "late"]);
    }

    #[test]
    fn a_priority_tie_breaks_by_name_in_natural_order() {
        let sorted = names(vec![
            layer("layer10", 5),
            layer("layer9", 5),
            layer("base", 0),
        ]);
        assert_eq!(sorted, ["base", "layer9", "layer10"]);
    }

    #[test]
    fn dirs_in_reads_base_first_then_naturally_and_skips_dotfiles() {
        let tmp = tempfile::tempdir().unwrap();
        /* `alpha` sorts before `base` by name, so it is what tells the
        base-first rule apart from plain natural order. */
        for name in ["zeta", "layer10", "base", "layer9", "alpha", ".hidden"] {
            fs::create_dir(tmp.path().join(name)).unwrap();
        }
        fs::write(tmp.path().join("loose.txt"), b"").unwrap();

        let dirs = dirs_in(tmp.path()).unwrap();
        let names: Vec<&str> = dirs.iter().map(|p| dir_name(p)).collect();
        assert_eq!(names, ["base", "alpha", "layer9", "layer10", "zeta"]);
    }
}
