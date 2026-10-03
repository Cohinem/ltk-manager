//! A mod archive opened for reading, and where its content unpacks to.

use std::path::Path;

use fs_err as fs;
use ltk_fantome::FantomeReader;
use ltk_modpkg::Modpkg;

use crate::error::{AppError, AppResult};

mod fantome_layer;
pub mod long_paths;

pub use fantome_layer::unpacked_layer_name;

/// Open `path` as a `.fantome`, naming the archive in the failure.
///
/// # Errors
///
/// Fails when the file does not open or holds no fantome.
pub fn open_fantome(path: &Path) -> AppResult<FantomeReader<fs::File>> {
    FantomeReader::new(fs::File::open(path)?)
        .map_err(|e| AppError::Fantome(format!("Failed to open {}: {e}", path.display())))
}

/// Mount `path` as a `.modpkg`.
///
/// # Errors
///
/// Fails when the file does not open or holds no package.
pub fn open_modpkg(path: &Path) -> AppResult<Modpkg<fs::File>> {
    Ok(Modpkg::mount_from_reader(fs::File::open(path)?)?)
}
