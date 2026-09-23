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

/// Each level of a chain buffer, as its stated size and its decoded PNG.
fn levels_of(buffer: &[u8]) -> Vec<((u32, u32), RgbaImage)> {
    let word = |at: usize| u32::from_le_bytes(buffer[at..at + 4].try_into().unwrap());
    assert_eq!(word(0), MAGIC);
    assert_eq!(word(4), VERSION);
    let mut at = 12;
    let mut levels = Vec::new();
    for _ in 0..word(8) {
        let (width, height, len) = (word(at), word(at + 4), word(at + 8) as usize);
        at += 12;
        let png = image::load_from_memory(&buffer[at..at + len])
            .unwrap()
            .to_rgba8();
        at += len;
        levels.push(((width, height), png));
    }
    assert_eq!(at, buffer.len(), "the buffer ends with its last level");
    levels
}

#[test]
fn a_chain_runs_from_the_width_asked_for_down_to_the_last_level() {
    let levels = levels_of(&render(&tex_bytes(64, 32, true), NonZeroU32::new(16)).unwrap());

    let sizes: Vec<_> = levels.iter().map(|(size, _)| *size).collect();
    assert_eq!(sizes, [(16, 8), (8, 4), (4, 2), (2, 1), (1, 1)]);
    for ((width, height), png) in &levels {
        assert_eq!((png.width(), png.height()), (*width, *height));
    }
}

#[test]
fn a_chain_with_no_width_opens_at_level_0() {
    let levels = levels_of(&render(&tex_bytes(64, 32, true), None).unwrap());

    assert_eq!(levels[0].0, (64, 32));
    assert_eq!(levels.len(), 7);
}

#[test]
fn a_level_keeps_the_alpha_the_file_stores() {
    let levels = levels_of(&render(&tex_bytes(16, 16, true), None).unwrap());

    let (_, top) = &levels[0];
    assert_eq!(top.get_pixel(0, 0)[3], 0, "the cut half stays cut");
    assert_eq!(top.get_pixel(15, 0)[3], 0xFF);
}

#[test]
fn a_tex_without_a_chain_answers_its_one_level() {
    let levels = levels_of(&render(&tex_bytes(16, 16, false), NonZeroU32::new(4)).unwrap());

    assert_eq!(levels.len(), 1);
    assert_eq!(levels[0].0, (16, 16));
}

#[test]
fn bytes_that_are_not_a_texture_report_a_read_error() {
    assert!(render(b"not a texture at all", None).is_err());
}
