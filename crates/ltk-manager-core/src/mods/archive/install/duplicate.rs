//! An archive the library already holds.

use super::*;
use sha2::{Digest, Sha256};

/// An archive's bytes, as the SHA-256 an import is compared by and their length.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SourceDigest {
    /// Lowercase hex.
    pub(crate) sha256: String,
    pub(crate) len: u64,
}

impl SourceDigest {
    /// The digest of the file at `path`.
    ///
    /// # Errors
    ///
    /// Fails when the file cannot be read.
    pub(crate) fn of(path: &Path) -> AppResult<Self> {
        let mut file = fs::File::open(path)?;
        let mut hasher = Sha256::new();
        let len = std::io::copy(&mut file, &mut hasher)?;

        Ok(Self {
            sha256: format!("{:x}", hasher.finalize()),
            len,
        })
    }
}

/// The mod an archive with `digest` was installed as, if the library holds one.
///
/// An entry installed before digests were recorded is matched by its stored
/// archive, which is the source's bytes whenever the import rewrote nothing.
pub(crate) fn installed_from<'a>(
    storage_dir: &Path,
    index: &'a LibraryIndex,
    digest: &SourceDigest,
) -> Option<&'a LibraryModEntry> {
    index
        .mods
        .iter()
        .filter(|entry| entry.is_present(storage_dir))
        .find(|entry| match &entry.source_sha256 {
            Some(sha256) => *sha256 == digest.sha256,
            None => {
                entry.is_packed()
                    && stored_archive_matches(&entry.archive_path(storage_dir), digest)
            }
        })
}

/// Whether the archive at `archive` has `digest`, hashing it only when the lengths agree.
fn stored_archive_matches(archive: &Path, digest: &SourceDigest) -> bool {
    let same_len = fs::metadata(archive).is_ok_and(|meta| meta.len() == digest.len);

    same_len && SourceDigest::of(archive).is_ok_and(|stored| stored == *digest)
}

/// `entry` as the library lists it, with the active profile's state and its folder.
///
/// # Errors
///
/// Fails when the mod's config cannot be read.
pub(crate) fn read_library_mod(
    storage_dir: &Path,
    index: &LibraryIndex,
    entry: &LibraryModEntry,
) -> AppResult<InstalledMod> {
    let (enabled, layers) = index.profile_state(&entry.id);
    let mut installed = read_installed_mod(entry, enabled, storage_dir, layers)?;
    installed.folder_id = index
        .folders
        .iter()
        .find(|folder| folder.mod_ids.contains(&entry.id))
        .map(|folder| folder.id.clone());

    Ok(installed)
}
