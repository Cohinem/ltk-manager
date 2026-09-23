use image::codecs::tga::TgaEncoder;
use image::{ExtendedColorType, ImageEncoder, Rgba, RgbaImage};

use super::*;

/// A TGA `width` by `height`, each texel's red its column and its alpha 255 less its row.
fn tga_bytes(width: u32, height: u32) -> Vec<u8> {
    let image = RgbaImage::from_fn(width, height, |x, y| Rgba([x as u8, 0, 0, 255 - y as u8]));
    let mut bytes = Vec::new();
    TgaEncoder::new(&mut bytes)
        .write_image(image.as_raw(), width, height, ExtendedColorType::Rgba8)
        .unwrap();
    bytes
}

fn decoded(preview: &PreviewImage) -> RgbaImage {
    assert_eq!(preview.mime, "image/png");
    image::load_from_memory(&preview.bytes).unwrap().to_rgba8()
}

#[test]
fn renders_a_tga_at_its_full_resolution() {
    let image = decoded(&render(&tga_bytes(8, 4), None).unwrap());

    assert_eq!((image.width(), image.height()), (8, 4));
    assert_eq!(
        *image.get_pixel(5, 2),
        Rgba([5, 0, 0, 253]),
        "rows stay top down"
    );
}

#[test]
fn a_width_scales_a_tga_down_keeping_its_aspect() {
    let image = decoded(&render(&tga_bytes(16, 8), NonZeroU32::new(4)).unwrap());

    assert_eq!((image.width(), image.height()), (4, 2));
}

#[test]
fn a_width_past_the_tga_renders_it_at_full_resolution() {
    let image = decoded(&render(&tga_bytes(8, 4), NonZeroU32::new(64)).unwrap());

    assert_eq!((image.width(), image.height()), (8, 4));
}

#[test]
fn bytes_that_are_not_a_tga_report_an_image_error() {
    let err = render(b"\x00\x01\x02", None).unwrap_err();

    assert!(
        matches!(err, PreviewError::Image(_)),
        "unexpected error: {err}"
    );
}
