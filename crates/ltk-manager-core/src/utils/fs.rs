//! Filesystem moves the standard library does not offer.

use std::fs;
use std::path::Path;

use crate::error::{AppError, AppResult};

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
