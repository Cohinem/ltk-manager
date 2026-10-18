use image::RgbaImage;
use ltk_texture::Tex;
use ltk_texture::tex::{EncodeFormat, EncodeOptions};

use super::*;

/// A `.tex` of `width` by `height`, its left half cut away to alpha 0.
fn tex_bytes(width: u32, height: u32, mipmaps: bool) -> Vec<u8> {
    let mut image = RgbaImage::new(width, height);
    for (x, _, pixel) in image.enumerate_pixels_mut() {
        let alpha = if x < width / 2 { 0 } else { 0xFF };
        *pixel = image::Rgba([0x80, 0x40, 0x20, alpha]);
    }
    let options = EncodeOptions::new(EncodeFormat::Bc3 {
        weigh_colour_by_alpha: false,
    });
    let options = if mipmaps {
        options.with_mipmaps()
    } else {
        options
    };
    let mut bytes = Vec::new();
    Tex::encode_rgba_image(&image, options)
        .unwrap()
        .write(&mut bytes)
        .unwrap();
    bytes
}

/// One level of a chain buffer: its stated size and its data.
type RawLevel = ((u32, u32), Vec<u8>);

/// Each level of a chain buffer, as its encoding, its stated size and its data.
fn raw_levels_of(buffer: &[u8]) -> (u32, Vec<RawLevel>) {
    let word = |at: usize| u32::from_le_bytes(buffer[at..at + 4].try_into().unwrap());
    assert_eq!(word(0), MAGIC);
    assert_eq!(word(4), VERSION);
    let encoding = word(12);
    let mut at = 16;
    let mut levels = Vec::new();
    for _ in 0..word(8) {
        let (width, height, len) = (word(at), word(at + 4), word(at + 8) as usize);
        at += 12;
        levels.push(((width, height), buffer[at..at + len].to_vec()));
        at += len;
    }
    assert_eq!(at, buffer.len(), "the buffer ends with its last level");
    (encoding, levels)
}

/// Each PNG level of a chain buffer, as its stated size and its decoded image.
fn levels_of(buffer: &[u8]) -> Vec<((u32, u32), RgbaImage)> {
    let (encoding, levels) = raw_levels_of(buffer);
    assert_eq!(encoding, Encoding::Png as u32);
    levels
        .into_iter()
        .map(|(size, png)| (size, image::load_from_memory(&png).unwrap().to_rgba8()))
        .collect()
}

#[test]
fn a_chain_runs_from_the_width_asked_for_down_to_the_last_level() {
    let levels = levels_of(&render(&tex_bytes(64, 32, true), NonZeroU32::new(16), false).unwrap());

    let sizes: Vec<_> = levels.iter().map(|(size, _)| *size).collect();
    assert_eq!(sizes, [(16, 8), (8, 4), (4, 2), (2, 1), (1, 1)]);
    for ((width, height), png) in &levels {
        assert_eq!((png.width(), png.height()), (*width, *height));
    }
}

#[test]
fn a_chain_with_no_width_opens_at_level_0() {
    let levels = levels_of(&render(&tex_bytes(64, 32, true), None, false).unwrap());

    assert_eq!(levels[0].0, (64, 32));
    assert_eq!(levels.len(), 7);
}

#[test]
fn a_level_keeps_the_alpha_the_file_stores() {
    let levels = levels_of(&render(&tex_bytes(16, 16, true), None, false).unwrap());

    let (_, top) = &levels[0];
    assert_eq!(top.get_pixel(0, 0)[3], 0, "the cut half stays cut");
    assert_eq!(top.get_pixel(15, 0)[3], 0xFF);
}

#[test]
fn a_tex_without_a_chain_answers_its_one_level() {
    let levels = levels_of(&render(&tex_bytes(16, 16, false), NonZeroU32::new(4), false).unwrap());

    assert_eq!(levels.len(), 1);
    assert_eq!(levels[0].0, (16, 16));
}

#[test]
fn bytes_that_are_not_a_texture_report_a_read_error() {
    assert!(render(b"not a texture at all", None, true).is_err());
}

#[test]
fn render_answers_the_files_own_blocks_when_blocks_are_asked_for() {
    let bytes = tex_bytes(64, 32, true);

    let (encoding, levels) = raw_levels_of(&render(&bytes, NonZeroU32::new(16), true).unwrap());

    assert_eq!(encoding, Encoding::Bc3 as u32);
    assert_eq!(levels[0].0, (16, 8));
    assert_eq!(
        levels[0].1.len(),
        4 * 2 * 16,
        "one 16 byte block per 4 by 4 texels"
    );
    let (smallest, blocks) = levels.last().unwrap();
    assert_eq!(*smallest, (1, 1));
    assert_eq!(
        blocks.as_slice(),
        &bytes[TEX_HEADER_LEN..TEX_HEADER_LEN + 16]
    );
}

#[test]
fn render_answers_png_levels_for_a_format_without_blocks() {
    let mut image = RgbaImage::new(8, 8);
    image.fill(0x7F);
    let mut bytes = Vec::new();
    Tex::encode_rgba_image(&image, EncodeOptions::new(EncodeFormat::Bgra8))
        .unwrap()
        .write(&mut bytes)
        .unwrap();

    let levels = levels_of(&render(&bytes, None, true).unwrap());

    assert_eq!(levels[0].0, (8, 8));
}
