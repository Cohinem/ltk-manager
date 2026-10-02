//! A sheet the mod owns: the images a project imported for a view, packed into one `.tex` its
//! elements point at with `AtlasData`, per section 5 of docs/plans/atlas-ui-editor.md.
//!
//! The sources and the pack spec sit in `.ltk/atlas/<sheet>/` of the project, outside `content/`,
//! so a build never ships them. The page is written into a layer on every import, and derives
//! from the spec and the sources alone.

use std::path::{Path, PathBuf};

use fs_err as fs;
use image::RgbaImage;
use ltk_manager_core::error::{AppError, AppResult};
use ltk_texture::tex::{EncodeFormat, EncodeOptions};
use ltk_texture::{Tex, Texture};
use serde::{Deserialize, Serialize};

use super::pack::{PackSprite, Packed, Placement, SpritePixels, compose, pack, pack_into};
use super::surface::detect_insets;

const SPEC_FILE: &str = "sheet.json";
/// The folder of a project the sheets and page patches keep their sources in.
pub const SHEETS_DIR: &str = ".ltk/atlas";
const CONTENT_DIR: &str = "content";

/// A sheet's pack spec: where its page goes and where each sprite sits on it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct SheetSpec {
    /// The page's chunk path, such as `assets/ux/<project>/<sheet>.tex`.
    pub path: String,
    /// The layer and the archive folder of it the page lands in.
    pub layer: String,
    pub archive: String,
    pub width: u32,
    pub height: u32,
    pub sprites: Vec<SheetSprite>,
}

/// One sprite of a sheet, whose source is `<key>.png` beside the spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct SheetSprite {
    pub key: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// A surface's slice insets, left, right, top and bottom in pixels, which stretch it as a
    /// nine-slice. None for a plain sprite.
    pub slice: Option<[u32; 4]>,
}

/// Where an import lands: the project, the sheet's name, and the layer and archive folder a new
/// sheet's page goes to.
pub struct SheetTarget<'a> {
    pub project: &'a Path,
    pub sheet: &'a str,
    pub layer: &'a str,
    pub archive: &'a str,
}

/// The sheet after an import, and the sprite the image became.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct SheetImport {
    pub sheet: SheetSpec,
    pub sprite: SheetSprite,
}

/// The spec of the sheet `sheet` of `project`, none where the project has not made it.
///
/// # Errors
///
/// Fails where the spec cannot be read or parsed.
pub fn read_sheet(project: &Path, sheet: &str) -> AppResult<Option<SheetSpec>> {
    let path = sheet_dir(project, sheet).join(SPEC_FILE);
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&fs::read(path)?)?))
}

/// Add the PNG at `source` to the sheet, or put it in place of the sprite `replace`, and write the
/// page again.
///
/// A replacement the same size as the sprite it replaces keeps its rect. Any other image joins
/// the sheet as a new sprite, and every sprite already on it keeps its rect.
///
/// # Errors
///
/// Fails where the image cannot be read, where the sheet would outgrow one page, and where the
/// page, the source or the spec cannot be written.
pub fn import_sprite(
    target: &SheetTarget<'_>,
    source: &Path,
    replace: Option<&str>,
) -> AppResult<SheetImport> {
    let image = image::open(source)
        .map_err(|error| AppError::ValidationFailed(format!("{}: {error}", source.display())))?
        .into_rgba8();
    import_image(target, &key_of(source), image, replace, None)
}

/// Add `image` to the sheet as a surface keyed for `name`: a sprite that stretches to any size as
/// a nine-slice, its slice lines found in the image, per section 5 of docs/plans/atlas-ui-editor.md.
/// A surface of that name already on the sheet takes the image and its slice lines, in place where
/// the sizes agree.
///
/// # Errors
///
/// Fails where the sheet would outgrow one page, and where the page, the image or the spec cannot
/// be written.
pub fn import_surface(
    target: &SheetTarget<'_>,
    name: &str,
    image: RgbaImage,
) -> AppResult<SheetImport> {
    let insets = detect_insets(&image);
    let key = slug(name);
    import_image(target, &key, image, Some(&key), Some(insets))
}

/// Add `image` to the sheet under `key`, or put it in place of the sprite `replace`, with the slice
/// insets `slice` where it is a surface, and write the page again.
fn import_image(
    target: &SheetTarget<'_>,
    key: &str,
    image: RgbaImage,
    replace: Option<&str>,
    slice: Option<[u32; 4]>,
) -> AppResult<SheetImport> {
    let dir = sheet_dir(target.project, target.sheet);
    let mut spec = read_sheet(target.project, target.sheet)?.unwrap_or_else(|| SheetSpec {
        path: page_path(target.project, target.sheet),
        layer: target.layer.to_owned(),
        archive: target.archive.to_owned(),
        width: 0,
        height: 0,
        sprites: Vec::new(),
    });

    let same_size =
        |sprite: &&SheetSprite| (sprite.width, sprite.height) == (image.width(), image.height());
    let kept = replace.and_then(|key| spec.sprites.iter().find(|s| s.key == key).filter(same_size));
    let sprite = match kept {
        Some(sprite) => {
            let key = sprite.key.clone();
            for held in spec.sprites.iter_mut().filter(|held| held.key == key) {
                held.slice = slice.or(held.slice);
            }
            spec.sprites
                .iter()
                .find(|held| held.key == key)
                .cloned()
                .ok_or_else(|| AppError::InternalState(format!("{key} was not kept")))?
        }
        None => {
            let key = unique_key(&spec, key);
            let wanted = PackSprite {
                key: key.clone(),
                width: image.width(),
                height: image.height(),
            };
            let packed = if spec.sprites.is_empty() {
                pack(&[wanted])
            } else {
                pack_into(&packed_of(&spec), &[wanted])
            }
            .map_err(|error| AppError::ValidationFailed(error.to_string()))?;

            let slices: Vec<_> = spec
                .sprites
                .iter()
                .map(|sprite| (sprite.key.clone(), sprite.slice))
                .chain([(key.clone(), slice)])
                .collect();
            spec.width = packed.width;
            spec.height = packed.height;
            spec.sprites = packed
                .placements
                .into_iter()
                .map(|placement| {
                    let held = slices.iter().find(|(held, _)| *held == placement.key);
                    sprite_of(placement, held.and_then(|(_, slice)| *slice))
                })
                .collect();
            spec.sprites
                .iter()
                .find(|s| s.key == key)
                .cloned()
                .ok_or_else(|| AppError::InternalState(format!("{key} was not placed")))?
        }
    };

    fs::create_dir_all(&dir)?;
    write_through_temp(
        &dir.join(format!("{}.png", sprite.key)),
        &png_bytes(&image)?,
    )?;
    write_page(target.project, &spec, &dir)?;
    write_through_temp(&dir.join(SPEC_FILE), &serde_json::to_vec_pretty(&spec)?)?;

    Ok(SheetImport {
        sheet: spec,
        sprite,
    })
}

/// The sprite at `uv` on the page `texture` holds, as a PNG at the page's own resolution.
///
/// `uv` is `[u0, v0, u1, v1]`, normalized with v down, in either order along each axis. The rect
/// rounds to whole pixels and is clamped to the page.
///
/// # Errors
///
/// Fails where `texture` does not decode and where the rect covers no pixel of the page.
pub fn sprite_png(texture: &[u8], uv: [f32; 4]) -> AppResult<Vec<u8>> {
    png_bytes(&sprite_pixels(texture, uv)?)
}

/// The pixels of the sprite at `uv` on the page `texture` holds, as `sprite_png` crops them.
///
/// # Errors
///
/// Fails where `texture` does not decode and where the rect covers no pixel of the page.
pub fn sprite_pixels(texture: &[u8], uv: [f32; 4]) -> AppResult<RgbaImage> {
    let page = decode_page(texture)?;
    let [x, y, width, height] = pixel_rect(uv, page.width(), page.height())?;
    Ok(image::imageops::crop_imm(&page, x, y, width, height).to_image())
}

/// The pixels of the image file at `path`.
///
/// # Errors
///
/// Fails where the file cannot be read or decoded.
pub fn png_pixels(path: &Path) -> AppResult<RgbaImage> {
    Ok(image::open(path)
        .map_err(|error| AppError::ValidationFailed(format!("{}: {error}", path.display())))?
        .into_rgba8())
}

/// Rewrite the page of the sheet whose sources sit in the folder `folder` of the project's sheets,
/// as a watcher does when a source changes. A folder with no spec rewrites nothing.
///
/// # Errors
///
/// Fails where the spec or a source cannot be read, and where the page cannot be written.
pub fn rebuild_sheet(project: &Path, folder: &str) -> AppResult<bool> {
    let Some(spec) = read_sheet(project, folder)? else {
        return Ok(false);
    };
    write_page(project, &spec, &sheet_dir(project, folder))?;
    Ok(true)
}

/// A texture's full-resolution pixels.
pub(super) fn decode_page(texture: &[u8]) -> AppResult<RgbaImage> {
    let invalid = |error: &dyn std::fmt::Display| AppError::ValidationFailed(error.to_string());
    let page = Texture::from_reader(&mut std::io::Cursor::new(texture))
        .map_err(|error| invalid(&error))?;
    page.decode_mipmap(0)
        .map_err(|error| invalid(&error))?
        .into_rgba_image()
        .map_err(|error| invalid(&error))
}

/// The whole pixels `uv` covers on a page of `width` by `height`, as `x, y, width, height`.
///
/// `uv` is `[u0, v0, u1, v1]`, normalized with v down, in either order along each axis. The rect
/// rounds to whole pixels and is clamped to the page.
///
/// # Errors
///
/// Fails where the rect covers no pixel of the page.
pub(super) fn pixel_rect(uv: [f32; 4], width: u32, height: u32) -> AppResult<[u32; 4]> {
    let span = |a: f32, b: f32, size: u32| {
        let pixel = |t: f32| (t * size as f32).round().clamp(0.0, size as f32) as u32;
        (pixel(a.min(b)), pixel(a.max(b)))
    };
    let (x0, x1) = span(uv[0], uv[2], width);
    let (y0, y1) = span(uv[1], uv[3], height);
    if x1 <= x0 || y1 <= y0 {
        return Err(AppError::ValidationFailed(
            "The sprite covers no pixel of its page".to_owned(),
        ));
    }
    Ok([x0, y0, x1 - x0, y1 - y0])
}

/// Compose the sheet's page from its sources and write it into its layer.
fn write_page(project: &Path, spec: &SheetSpec, dir: &Path) -> AppResult<()> {
    let mut sources = Vec::with_capacity(spec.sprites.len());
    for sprite in &spec.sprites {
        let path = dir.join(format!("{}.png", sprite.key));
        let image = image::open(&path)
            .map_err(|error| AppError::ValidationFailed(format!("{}: {error}", path.display())))?
            .into_rgba8();
        sources.push((sprite.key.as_str(), image));
    }

    let alpha = sources
        .iter()
        .any(|(_, image)| image.pixels().any(|pixel| pixel.0[3] < u8::MAX));
    let page = compose(&packed_of(spec), |key| {
        let (_, image) = sources.iter().find(|(held, _)| *held == key)?;
        Some(SpritePixels {
            width: image.width(),
            height: image.height(),
            rgba: image.as_raw(),
        })
    });
    let page = RgbaImage::from_raw(spec.width, spec.height, page)
        .ok_or_else(|| AppError::InternalState("the page is not its size".to_owned()))?;

    let bytes = encode_page(&page, alpha)?;
    write_into_layer(project, &spec.layer, &spec.archive, &spec.path, &bytes)
}

/// `page` as the `.tex` a layer ships: BC7 where it has `alpha` and BC1 where it has none, with
/// no mipmaps, as the game's own pages are.
pub(super) fn encode_page(page: &RgbaImage, alpha: bool) -> AppResult<Vec<u8>> {
    let format = if alpha {
        EncodeFormat::Bc7
    } else {
        EncodeFormat::Bc1 {
            weigh_colour_by_alpha: false,
        }
    };
    let tex = Tex::encode_rgba_image(page, EncodeOptions::new(format))
        .map_err(|error| AppError::Other(error.to_string()))?;
    let mut bytes = Vec::new();
    tex.write(&mut bytes)?;
    Ok(bytes)
}

/// Write `bytes` into the archive folder `archive` of the layer `layer` at the chunk path `path`.
pub(super) fn write_into_layer(
    project: &Path,
    layer: &str,
    archive: &str,
    path: &str,
    bytes: &[u8],
) -> AppResult<()> {
    let target = project
        .join(CONTENT_DIR)
        .join(layer)
        .join(archive)
        .join(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    write_through_temp(&target, bytes)
}

fn sheet_dir(project: &Path, sheet: &str) -> PathBuf {
    project.join(SHEETS_DIR).join(slug(sheet))
}

/// The page's chunk path, under the project's own folder so two mods never share a page.
fn page_path(project: &Path, sheet: &str) -> String {
    let owner = project
        .file_name()
        .and_then(|name| name.to_str())
        .map_or_else(|| "mod".to_owned(), slug);
    format!("assets/ux/{owner}/{}.tex", slug(sheet))
}

fn packed_of(spec: &SheetSpec) -> Packed {
    Packed {
        width: spec.width,
        height: spec.height,
        placements: spec
            .sprites
            .iter()
            .map(|sprite| Placement {
                key: sprite.key.clone(),
                x: sprite.x,
                y: sprite.y,
                width: sprite.width,
                height: sprite.height,
            })
            .collect(),
    }
}

fn sprite_of(placement: Placement, slice: Option<[u32; 4]>) -> SheetSprite {
    SheetSprite {
        key: placement.key,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        slice,
    }
}

fn key_of(source: &Path) -> String {
    slug(
        source
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or(""),
    )
}

/// `wanted`, or it with the first free `_<n>` after it where the sheet holds it already.
fn unique_key(spec: &SheetSpec, wanted: &str) -> String {
    let taken = |key: &str| spec.sprites.iter().any(|sprite| sprite.key == key);
    if !taken(wanted) {
        return wanted.to_owned();
    }
    (2..)
        .map(|n| format!("{wanted}_{n}"))
        .find(|key| !taken(key))
        .unwrap_or_default()
}

/// `text` lowercased, with anything but a letter, a digit, `-` or `_` as `_`.
pub(super) fn slug(text: &str) -> String {
    let slug: String = text
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    if slug.is_empty() {
        "sprite".to_owned()
    } else {
        slug
    }
}

pub(super) fn png_bytes(image: &RgbaImage) -> AppResult<Vec<u8>> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|error| AppError::Other(error.to_string()))?;
    Ok(bytes.into_inner())
}

/// Write `bytes` beside `path` and rename them over it, so a failed write leaves the old file.
pub(super) fn write_through_temp(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let mut temp = path.as_os_str().to_owned();
    temp.push(".tmp");
    let temp = PathBuf::from(temp);
    fs::write(&temp, bytes)?;
    fs::rename(&temp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests;
