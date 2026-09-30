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
use ltk_texture::Tex;
use ltk_texture::tex::{EncodeFormat, EncodeOptions};
use serde::{Deserialize, Serialize};

use super::pack::{PackSprite, Packed, Placement, SpritePixels, compose, pack, pack_into};

const SPEC_FILE: &str = "sheet.json";
const SHEETS_DIR: &str = ".ltk/atlas";
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
        Some(sprite) => sprite.clone(),
        None => {
            let key = unique_key(&spec, &key_of(source));
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

            spec.width = packed.width;
            spec.height = packed.height;
            spec.sprites = packed.placements.into_iter().map(sprite_of).collect();
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

/// Compose the sheet's page from its sources and write it into its layer: BC7 where a sprite
/// has alpha and BC1 where none does, with no mipmaps, as the game's own pages are.
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

    let format = if alpha {
        EncodeFormat::Bc7
    } else {
        EncodeFormat::Bc1 {
            weigh_colour_by_alpha: false,
        }
    };
    let tex = Tex::encode_rgba_image(&page, EncodeOptions::new(format))
        .map_err(|error| AppError::Other(error.to_string()))?;
    let mut bytes = Vec::new();
    tex.write(&mut bytes)?;

    let target = project
        .join(CONTENT_DIR)
        .join(&spec.layer)
        .join(&spec.archive)
        .join(&spec.path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    write_through_temp(&target, &bytes)
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

fn sprite_of(placement: Placement) -> SheetSprite {
    SheetSprite {
        key: placement.key,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
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
fn slug(text: &str) -> String {
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

fn png_bytes(image: &RgbaImage) -> AppResult<Vec<u8>> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|error| AppError::Other(error.to_string()))?;
    Ok(bytes.into_inner())
}

/// Write `bytes` beside `path` and rename them over it, so a failed write leaves the old file.
fn write_through_temp(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let mut temp = path.as_os_str().to_owned();
    temp.push(".tmp");
    let temp = PathBuf::from(temp);
    fs::write(&temp, bytes)?;
    fs::rename(&temp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests;
