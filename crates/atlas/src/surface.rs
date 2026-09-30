//! A surface's slice lines, found in its image, per section 5 of docs/plans/atlas-ui-editor.md.
//!
//! Edge art is where a whole column, or a whole row, changes from the next: a rim or an inset line
//! changes along the panel's full length, where the grain of a fill and a soft gradient barely
//! change on average. Scanning in from each side, the edge art ends at the first calm stretch after
//! a change, so a decoration further inside the fill is never taken for edge art.

use image::RgbaImage;

/// The mean change per line, per channel, that marks edge art.
const EDGE: f32 = 8.0;
/// How many calm lines in a row end the edge art.
const CALM_RUN: u32 = 4;
/// How far in from its side, as a share of the axis, edge art can reach.
const REACH: f32 = 0.45;

/// The insets of a surface image, left, right, top and bottom in pixels: how far its edge art
/// reaches in from each side, transparent margins included.
pub fn detect_insets(image: &RgbaImage) -> [u32; 4] {
    let (width, height) = image.dimensions();
    let columns: Vec<f32> = (0..width.saturating_sub(1))
        .map(|x| {
            mean_change(height, |y| {
                (image.get_pixel(x, y).0, image.get_pixel(x + 1, y).0)
            })
        })
        .collect();
    let rows: Vec<f32> = (0..height.saturating_sub(1))
        .map(|y| {
            mean_change(width, |x| {
                (image.get_pixel(x, y).0, image.get_pixel(x, y + 1).0)
            })
        })
        .collect();

    let [left, right] = insets(&columns, width);
    let [top, bottom] = insets(&rows, height);
    [left, right, top, bottom]
}

/// The mean over a line of `length` pixels of the largest channel change between each pair
/// `pair(i)` gives.
fn mean_change(length: u32, pair: impl Fn(u32) -> ([u8; 4], [u8; 4])) -> f32 {
    if length == 0 {
        return 0.0;
    }
    let total: u32 = (0..length)
        .map(|i| {
            let (a, b) = pair(i);
            a.iter()
                .zip(b)
                .map(|(p, q)| u32::from(p.abs_diff(q)))
                .max()
                .unwrap_or(0)
        })
        .sum();
    total as f32 / length as f32
}

/// The two insets along an axis of `size` lines, from `profile`, the change between each line and
/// the next.
fn insets(profile: &[f32], size: u32) -> [u32; 2] {
    let reach = ((size as f32 * REACH) as usize).min(profile.len());
    let near = edge_end(profile.iter().take(reach).enumerate());
    let far = edge_end(profile.iter().enumerate().rev().take(reach));

    [
        near.map_or(0, |line| line as u32 + 1),
        far.map_or(0, |line| size - 1 - line as u32),
    ]
}

/// The last change line of the edge art `lines` walk into, in the order they walk: every line
/// that changes, until a calm run follows the first change.
fn edge_end<'a>(lines: impl Iterator<Item = (usize, &'a f32)>) -> Option<usize> {
    let mut last = None;
    let mut calm = 0;
    for (line, &change) in lines {
        if change > EDGE {
            last = Some(line);
            calm = 0;
        } else if last.is_some() {
            calm += 1;
            if calm >= CALM_RUN {
                break;
            }
        }
    }
    last
}

#[cfg(test)]
mod tests;
