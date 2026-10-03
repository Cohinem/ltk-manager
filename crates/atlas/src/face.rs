//! Font files an author imports, which a declared `FontType` then draws with.

use std::path::Path;

use fs_err as fs;
use ltk_manager_base::error::{AppError, AppResult};

use super::sheet::write_through_temp;

/// The folder an imported font file is written under, as a `FontType` spells its path.
pub const FONT_FILES_DIR: &str = "ASSETS/UX/Fonts/Mods";

/// The file types the client draws a face from.
const FONT_EXTENSIONS: [&str; 2] = ["ttf", "otf"];

/// Copy the `.ttf` or `.otf` at `source` into `archive` of the project's `layer`, answering the
/// path a `FontType` names it by. A file already imported under the same name is replaced.
///
/// # Errors
///
/// Fails for a file of another type, and when `source` cannot be read or the copy written.
pub fn import_font_file(
    project: &Path,
    layer: &str,
    archive: &str,
    source: &Path,
) -> AppResult<String> {
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| FONT_EXTENSIONS.contains(&extension.as_str()))
        .ok_or_else(|| AppError::ValidationFailed("A font file is a .ttf or an .otf".to_owned()))?;
    let stem: String = source
        .file_stem()
        .map(|stem| stem.to_string_lossy())
        .unwrap_or_default()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let named = format!("{FONT_FILES_DIR}/{stem}.{extension}");

    let bytes = fs::read(source)?;
    /* The archive packs a layer file by its path's hash, which the client takes lowercase. */
    let destination = project
        .join("content")
        .join(layer)
        .join(archive)
        .join(named.to_ascii_lowercase());
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    write_through_temp(&destination, &bytes)?;
    Ok(named)
}

#[cfg(test)]
mod tests;
