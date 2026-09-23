use std::io::Cursor;
use std::num::NonZeroU32;

use image::{ImageFormat, ImageReader};

use super::texture::png_of;
use super::{PreviewError, PreviewImage};

/// Decode a TGA into a PNG the webview can draw, scaled down to `min_width`.
///
/// A TGA holds no mipmap chain, so a width scales the whole image, keeping its
/// aspect. No width, and a width at or past the image's own, draw it at full
/// resolution.
///
/// # Errors
///
/// Fails when `bytes` is not a TGA `image` decodes, and when the preview does not encode.
pub fn render(bytes: &[u8], min_width: Option<NonZeroU32>) -> Result<PreviewImage, PreviewError> {
    let mut image = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Tga)
        .decode()
        .map_err(PreviewError::Image)?;

    if let Some(min_width) = min_width.map(NonZeroU32::get)
        && image.width() > min_width
    {
        /* The height bound never binds, so the width alone sets the scale. */
        image = image.thumbnail(min_width, u32::MAX);
    }
    png_of(&image.into_rgba8())
}

#[cfg(test)]
mod tests;
