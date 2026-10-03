//! A game page the project rebuilds with images of its own pasted over some of its sprites, per
//! section 5 of docs/plans/atlas-ui-editor.md.
//!
//! The images and the spec sit in `.ltk/atlas/pages/<page>/` of the project, outside `content/`.
//! The page derives from the game's own texture and those images alone, so it is rebuilt whenever
//! an image changes, and every element and manifest entry naming a sprite on it keeps its rect.

use std::path::{Path, PathBuf};

use fs_err as fs;
use image::RgbaImage;
use ltk_manager_base::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

use super::sheet::{
    SHEETS_DIR, decode_page, encode_page, pixel_rect, png_bytes, slug, write_into_layer,
    write_through_temp,
};

/// The folder under the project's sheets that page patches keep their folders in.
pub const PAGES_DIR: &str = "pages";
const SPEC_FILE: &str = "patch.json";
const PAGE_EXTENSION: &str = ".tex";

/// A game page the project rebuilds: where it goes and the sprites pasted over it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct PagePatch {
    /// The page's chunk path, the game's own.
    pub path: String,
    /// The layer and the archive folder of it the page lands in.
    pub layer: String,
    pub archive: String,
    pub sprites: Vec<PatchSprite>,
}

/// One sprite pasted over a page, whose image is `<key>.png` beside the spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct PatchSprite {
    pub key: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Where a patched page lands: the project, the page's chunk path, and the layer and archive
/// folder it goes to.
pub struct PatchTarget<'a> {
    pub project: &'a Path,
    pub path: &'a str,
    pub layer: &'a str,
    pub archive: &'a str,
}

/// Whether a page at the chunk path `path` can be patched: a named `.tex`.
pub fn patchable(path: &str) -> bool {
    path.to_ascii_lowercase().ends_with(PAGE_EXTENSION)
}

/// Paste the PNG at `source` over the sprite at `uv` of the game page `base`, and rebuild the page
/// into the project's layer.
///
/// Answers none, writing nothing, where the page is no `.tex` or the image is not the sprite's
/// size, since pasting another size would spill onto the sprites beside it.
///
/// # Errors
///
/// Fails where the page does not decode, where the image cannot be read, and where the image,
/// the spec or the page cannot be written.
pub fn patch_sprite(
    target: &PatchTarget<'_>,
    base: &[u8],
    uv: [f32; 4],
    source: &Path,
) -> AppResult<Option<PagePatch>> {
    if !patchable(target.path) {
        return Ok(None);
    }

    let page = decode_page(base)?;
    let [x, y, width, height] = pixel_rect(uv, page.width(), page.height())?;
    let image = image::open(source)
        .map_err(|error| AppError::ValidationFailed(format!("{}: {error}", source.display())))?
        .into_rgba8();
    if image.dimensions() != (width, height) {
        return Ok(None);
    }

    let dir = patch_dir(target.project, target.path);
    let mut spec = read_spec(&dir)?.unwrap_or_else(|| PagePatch {
        path: target.path.to_owned(),
        layer: target.layer.to_owned(),
        archive: target.archive.to_owned(),
        sprites: Vec::new(),
    });
    let key = format!("{x}_{y}_{width}x{height}");
    spec.sprites.retain(|sprite| sprite.key != key);
    spec.sprites.push(PatchSprite {
        key: key.clone(),
        x,
        y,
        width,
        height,
    });

    fs::create_dir_all(&dir)?;
    write_through_temp(&dir.join(format!("{key}.png")), &png_bytes(&image)?)?;
    write_through_temp(&dir.join(SPEC_FILE), &serde_json::to_vec_pretty(&spec)?)?;
    write_patched(target.project, &spec, &dir, page)?;
    Ok(Some(spec))
}

/// The patch whose sources sit in the folder `folder` of the project's page patches, none where
/// the folder holds no spec.
///
/// # Errors
///
/// Fails where the spec cannot be read or parsed.
pub fn read_patch(project: &Path, folder: &str) -> AppResult<Option<PagePatch>> {
    read_spec(&pages_dir(project).join(folder))
}

/// Rebuild the patched page whose sources sit in `folder` over the game page `base`, as a watcher
/// does when an image changes.
///
/// # Errors
///
/// Fails where the spec cannot be read, the page does not decode, or the page cannot be written.
pub fn rebuild_patch(project: &Path, folder: &str, base: &[u8]) -> AppResult<Option<PagePatch>> {
    let dir = pages_dir(project).join(folder);
    let Some(spec) = read_spec(&dir)? else {
        return Ok(None);
    };
    write_patched(project, &spec, &dir, decode_page(base)?)?;
    Ok(Some(spec))
}

/// `page` with each sprite's image pasted over its rect, written into the patch's layer. An image
/// edited to another size than its sprite is left out, since pasting it would spill onto the
/// sprites beside it.
fn write_patched(
    project: &Path,
    spec: &PagePatch,
    dir: &Path,
    mut page: RgbaImage,
) -> AppResult<()> {
    for sprite in &spec.sprites {
        let path = dir.join(format!("{}.png", sprite.key));
        let image = image::open(&path)
            .map_err(|error| AppError::ValidationFailed(format!("{}: {error}", path.display())))?
            .into_rgba8();
        if image.dimensions() != (sprite.width, sprite.height) {
            tracing::warn!(
                image = %path.display(),
                "A patch image no longer matches its sprite's size and was left out"
            );
            continue;
        }
        image::imageops::replace(&mut page, &image, i64::from(sprite.x), i64::from(sprite.y));
    }

    let alpha = page.pixels().any(|pixel| pixel.0[3] < u8::MAX);
    let bytes = encode_page(&page, alpha)?;
    write_into_layer(project, &spec.layer, &spec.archive, &spec.path, &bytes)
}

fn read_spec(dir: &Path) -> AppResult<Option<PagePatch>> {
    let path = dir.join(SPEC_FILE);
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&fs::read(path)?)?))
}

fn pages_dir(project: &Path) -> PathBuf {
    project.join(SHEETS_DIR).join(PAGES_DIR)
}

fn patch_dir(project: &Path, path: &str) -> PathBuf {
    pages_dir(project).join(slug(path))
}

#[cfg(test)]
mod tests;
