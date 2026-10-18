//! A texture's own mip chain, as the buffer a viewport uploads every level of.
//!
//! The chain is the file's rather than one the GPU averages, because an alpha-tested
//! texture ships every level at binary alpha with level 0's coverage, and an averaged
//! level fades its cutout away with distance.
//!
//! # The buffer
//!
//! Little-endian throughout, with no padding between blocks.
//!
//! ```text
//! magic      u32   0x544B544C, `LTKT`
//! version    u32   2
//! levelCount u32
//! encoding   u32   0 PNG, 1 BC1 blocks, 2 BC3 blocks
//! levels     levelCount * { width u32, height u32, len u32, data u8[len] }
//! ```
//!
//! The levels run from the smallest mipmap at least the asked width wide, or level 0 where
//! no width is asked, down to the file's last. A PNG level is RGBA. A block level is the
//! file's own blocks, which a GPU with S3TC uploads without a decode.

use std::io::Cursor;
use std::num::NonZeroU32;
use std::ops::Range;

use ltk_texture::Texture;
use ltk_texture::tex::{Format, ResourceType};

use super::texture::{decode_mipmap, level_for, png_of};
use super::{PreviewError, count_of};

/// The word a mip chain buffer opens with, `LTKT` in the order the buffer is written in.
const MAGIC: u32 = 0x544B_544C;

/// The layout this module writes.
const VERSION: u32 = 2;

/// The length of a `.tex` header, after which the levels run from the smallest.
const TEX_HEADER_LEN: usize = 12;

/// One level of a chain: its width, its height and its data.
type Level<'a> = (u32, u32, &'a [u8]);

/// How every level of a chain buffer is written.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
enum Encoding {
    Png = 0,
    Bc1 = 1,
    Bc3 = 2,
}

/// Decode a texture's mip chain into the buffer this module documents.
///
/// With `blocks`, a BC1 or BC3 `.tex` answers its own blocks, and any other texture answers
/// PNG levels.
///
/// # Errors
///
/// Fails when `bytes` is not a texture either container recognizes, and when a level's
/// pixel data does not match what the header declares.
pub fn render(
    bytes: &[u8],
    min_width: Option<NonZeroU32>,
    blocks: bool,
) -> Result<Vec<u8>, PreviewError> {
    let texture = Texture::from_reader(&mut Cursor::new(bytes))?;
    let first = level_for(texture.width(), texture.mip_count(), min_width);
    let levels = first..texture.mip_count().max(first + 1);

    if blocks && let Some((encoding, raw)) = block_levels(bytes, &texture, levels.clone()) {
        return chain(encoding, raw.iter().map(|(w, h, data)| (*w, *h, *data)));
    }

    let mut pngs = Vec::new();
    for level in levels {
        let image = decode_mipmap(&texture, level)?.into_rgba_image()?;
        pngs.push((image.width(), image.height(), png_of(&image)?.bytes));
    }
    chain(
        Encoding::Png,
        pngs.iter().map(|(w, h, png)| (*w, *h, png.as_slice())),
    )
}

/// Writes the chain buffer of `levels`, each a width, a height and its data.
fn chain<'a>(
    encoding: Encoding,
    levels: impl ExactSizeIterator<Item = Level<'a>>,
) -> Result<Vec<u8>, PreviewError> {
    let mut buffer = Vec::new();
    for word in [MAGIC, VERSION, count_of(levels.len())?, encoding as u32] {
        buffer.extend(word.to_le_bytes());
    }
    for (width, height, data) in levels {
        for word in [width, height, count_of(data.len())?] {
            buffer.extend(word.to_le_bytes());
        }
        buffer.extend(data);
    }
    Ok(buffer)
}

/// Returns the blocks of each of `levels` of a 2D BC1 or BC3 `.tex`, sliced out of `bytes`.
///
/// Returns `None` for any other texture, and for a file whose data ends before a level.
fn block_levels<'a>(
    bytes: &'a [u8],
    texture: &Texture,
    levels: Range<u32>,
) -> Option<(Encoding, Vec<Level<'a>>)> {
    let Texture::Tex(tex) = texture else {
        return None;
    };
    let encoding = match tex.format {
        Format::Bc1 => Encoding::Bc1,
        Format::Bc3 => Encoding::Bc3,
        _ => return None,
    };
    if tex.resource_type != ResourceType::Texture || tex.depth > 1 {
        return None;
    }

    let block_bytes = tex.format.bytes_per_block();
    let size = |level: u32| {
        let width = (u32::from(tex.width) >> level).max(1);
        let height = (u32::from(tex.height) >> level).max(1);
        let len = width.div_ceil(4) as usize * height.div_ceil(4) as usize * block_bytes;
        (width, height, len)
    };
    /* The file stores its levels from the smallest, so a level starts after every smaller one. */
    let start = |level: u32| -> usize { (level + 1..tex.mip_count).map(|at| size(at).2).sum() };

    let data = bytes.get(TEX_HEADER_LEN..)?;
    let mut out = Vec::new();
    for level in levels {
        let (width, height, len) = size(level);
        let at = start(level);
        out.push((width, height, data.get(at..at + len)?));
    }
    Some((encoding, out))
}

#[cfg(test)]
mod tests;
