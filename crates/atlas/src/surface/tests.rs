use image::Rgba;

use super::*;

const CLEAR: Rgba<u8> = Rgba([0, 0, 0, 0]);
const GREY: Rgba<u8> = Rgba([90, 90, 90, 255]);
const GOLD: Rgba<u8> = Rgba([200, 160, 70, 255]);

/// A panel of `width` by `height` inside a transparent `margin`: a 3 pixel grey rim, a 2 pixel
/// gold line inside it, and a fill that darkens from top to bottom with a grain of `grain` levels.
fn panel(width: u32, height: u32, margin: u32, grain: u8) -> RgbaImage {
    RgbaImage::from_fn(width, height, |x, y| {
        let inside = x >= margin && y >= margin && x < width - margin && y < height - margin;
        if !inside {
            return CLEAR;
        }

        let ring = (x - margin)
            .min(y - margin)
            .min(width - margin - 1 - x)
            .min(height - margin - 1 - y);
        let noise = ((x * 7 + y * 13) % u32::from(grain.max(1))) as u8;
        match ring {
            0..=2 => GREY,
            3..=4 => GOLD,
            _ => Rgba([20 + noise, 40 + noise, 50 - (y / 8) as u8, 255]),
        }
    })
}

#[test]
fn a_panel_stretches_between_its_edge_art_on_both_axes() {
    assert_eq!(detect_insets(&panel(64, 40, 0, 1)), [5, 5, 5, 5]);
}

#[test]
fn a_grainy_fill_and_a_transparent_margin_still_find_the_rim() {
    assert_eq!(detect_insets(&panel(120, 60, 6, 5)), [11, 11, 11, 11]);
}

#[test]
fn a_decoration_inside_the_fill_is_not_edge_art() {
    let mut image = panel(120, 60, 0, 1);
    for y in 15..30 {
        for x in 20..35 {
            image.put_pixel(x, y, GOLD);
        }
    }

    assert_eq!(detect_insets(&image), [5, 5, 5, 5]);
}

#[test]
fn a_rim_thicker_on_one_side_keeps_each_side_its_own_inset() {
    let mut image = panel(64, 40, 0, 1);
    for y in 0..40 {
        for x in 5..12 {
            image.put_pixel(x, y, Rgba([x as u8 * 20, 0, 0, 255]));
        }
    }

    let [left, right, ..] = detect_insets(&image);
    assert_eq!((left, right), (12, 5));
}

#[test]
fn a_flat_image_stretches_whole() {
    let flat = RgbaImage::from_pixel(30, 30, GOLD);

    assert_eq!(detect_insets(&flat), [0, 0, 0, 0]);
}
