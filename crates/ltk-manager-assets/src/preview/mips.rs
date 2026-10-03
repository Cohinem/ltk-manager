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
//! version    u32   1
//! levelCount u32
//! levels     levelCount * { width u32, height u32, pngLen u32, png u8[pngLen] }
//! ```
//!
//! The levels run from the smallest mipmap at least the asked width wide, or level 0 where
//! no width is asked, down to the file's last. Each is an RGBA PNG of that level.

use std::io::Cursor;
use std::num::NonZeroU32;

use ltk_texture::Texture;

use super::texture::{decode_mipmap, level_for, png_of};
use super::{PreviewError, count_of};

/// The word a mip chain buffer opens with, `LTKT` in the order the buffer is written in.
const MAGIC: u32 = 0x544B_544C;

/// The layout this module writes.
const VERSION: u32 = 1;

/// Decode a texture's mip chain into the buffer this module documents.
///
/// # Errors
///
/// Fails when `bytes` is not a texture either container recognizes, and when a level's
/// pixel data does not match what the header declares.
pub fn render(bytes: &[u8], min_width: Option<NonZeroU32>) -> Result<Vec<u8>, PreviewError> {
    let texture = Texture::from_reader(&mut Cursor::new(bytes))?;
    let first = level_for(texture.width(), texture.mip_count(), min_width);
    let levels = first..texture.mip_count().max(first + 1);

    let mut buffer = Vec::new();
    for word in [MAGIC, VERSION, count_of(levels.len())?] {
        buffer.extend(word.to_le_bytes());
    }
    for level in levels {
        let image = decode_mipmap(&texture, level)?.into_rgba_image()?;
        let png = png_of(&image)?.bytes;
        for word in [image.width(), image.height(), count_of(png.len())?] {
            buffer.extend(word.to_le_bytes());
        }
        buffer.extend(png);
    }
    Ok(buffer)
}

#[cfg(test)]
mod tests;
