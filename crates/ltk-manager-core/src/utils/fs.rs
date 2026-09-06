//! Filesystem moves the standard library does not offer.

use fs_err as fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Write `contents` to `path` through a sibling temporary file.
///
/// A plain `fs::write` can leave `path` truncated if the process dies or the
/// disk fills mid-write. The rename is atomic on every supported platform, so
/// `path` is either the old bytes or the new ones.
///
/// # Errors
///
/// Fails when the temporary file cannot be written or renamed. A failed rename
/// leaves the temporary file behind rather than the destination damaged.
pub(crate) fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let tmp = temp_beside(path);
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)
}

/// `path` with `.tmp` appended, keeping the extension the caller chose.
fn temp_beside(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".tmp");
    PathBuf::from(name)
}

/// Copy `source` and everything under it into `destination`.
///
/// Symlinks are skipped rather than followed or recreated, so a copy can never
/// walk out of `source` or reproduce a link the destination cannot resolve.
/// `destination` is created if it does not exist, and an existing file there is
/// overwritten.
///
/// # Errors
///
/// Fails with [`AppError::Io`] on the first entry that cannot be read or
/// written, which leaves whatever was already copied in place.
pub(crate) fn copy_dir_all(source: &Path, destination: &Path) -> AppResult<()> {
    fs::create_dir_all(destination)?;

    for entry in walkdir::WalkDir::new(source).follow_links(false) {
        let entry = entry.map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
        let file_type = entry.file_type();
        if file_type.is_symlink() {
            continue;
        }

        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|e| AppError::Other(e.to_string()))?;
        let target = destination.join(relative);

        if file_type.is_dir() {
            fs::create_dir_all(&target)?;
        } else if file_type.is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), &target)?;
        }
    }

    Ok(())
}
