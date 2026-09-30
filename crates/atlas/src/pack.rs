//! The sheet packer: sprites placed on one power-of-two page by MaxRects, each with its edge
//! pixels extruded into a padding of its own, per section 5 of docs/plans/atlas-ui-editor.md.

use std::cmp::Reverse;

/// The pixels around a sprite that its edges extrude into, which keep it 2 px from the page edge
/// and 4 px from a neighbour as the game's own pages are.
pub const SPRITE_PADDING: u32 = 2;

/// The longest side a page takes.
pub const MAX_PAGE: u32 = 2048;

const MIN_PAGE: u32 = 16;

/// A sprite to place, by its key and its size in pixels.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackSprite {
    pub key: String,
    pub width: u32,
    pub height: u32,
}

/// Where a sprite sits on the page, its padding outside the rect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Placement {
    pub key: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// A packed page: its size and every sprite's place on it, in the packer's order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Packed {
    pub width: u32,
    pub height: u32,
    pub placements: Vec<Placement>,
}

/// Why sprites do not pack.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PackError {
    #[error("no sprites to pack")]
    Empty,
    #[error("sprite {key} has no pixels")]
    Unsized { key: String },
    #[error("the sprites do not fit one {MAX_PAGE} x {MAX_PAGE} page")]
    TooLarge,
}

/// The smallest page `sprites` pack onto, by area, then the squarest, then the widest.
///
/// The sprites place tallest first, then widest, then by key, so the same sprites pack to the
/// same page whatever order they arrive in.
pub fn pack(sprites: &[PackSprite]) -> Result<Packed, PackError> {
    if sprites.is_empty() {
        return Err(PackError::Empty);
    }
    if let Some(sprite) = sprites.iter().find(|s| s.width == 0 || s.height == 0) {
        return Err(PackError::Unsized {
            key: sprite.key.clone(),
        });
    }

    let mut ordered: Vec<&PackSprite> = sprites.iter().collect();
    ordered.sort_by_key(|s| (Reverse(s.height), Reverse(s.width), s.key.as_str()));

    let cells = ordered.iter().map(|s| cell(s.width) * cell(s.height));
    let area: u64 = cells.map(u64::from).sum();
    let widest = ordered.iter().map(|s| cell(s.width)).max().unwrap_or(0);
    let tallest = ordered.iter().map(|s| cell(s.height)).max().unwrap_or(0);

    page_sizes()
        .filter(|&(w, h)| w >= widest && h >= tallest && u64::from(w) * u64::from(h) >= area)
        .find_map(|(width, height)| {
            let placements = place(&ordered, &[], width, height)?;
            Some(Packed {
                width,
                height,
                placements,
            })
        })
        .ok_or(PackError::TooLarge)
}

/// `packed` with `sprites` added, every sprite it holds kept where it is.
///
/// A sprite placed once keeps its pixel rect for good, so an element pointing at it stays right
/// however many sprites join later. The page grows only where the new sprites do not fit, and a
/// grown page keeps the old one as its top left corner.
pub fn pack_into(packed: &Packed, sprites: &[PackSprite]) -> Result<Packed, PackError> {
    if sprites.is_empty() {
        return Ok(packed.clone());
    }
    if let Some(sprite) = sprites.iter().find(|s| s.width == 0 || s.height == 0) {
        return Err(PackError::Unsized {
            key: sprite.key.clone(),
        });
    }

    let mut ordered: Vec<&PackSprite> = sprites.iter().collect();
    ordered.sort_by_key(|s| (Reverse(s.height), Reverse(s.width), s.key.as_str()));

    page_sizes()
        .filter(|&(w, h)| w >= packed.width && h >= packed.height)
        .find_map(|(width, height)| {
            let added = place(&ordered, &packed.placements, width, height)?;
            let mut placements = packed.placements.clone();
            placements.extend(added);
            Some(Packed {
                width,
                height,
                placements,
            })
        })
        .ok_or(PackError::TooLarge)
}

/// Every page size from the smallest to 2048 square, in the order `pack` tries them.
fn page_sizes() -> impl Iterator<Item = (u32, u32)> {
    let sides: Vec<u32> = std::iter::successors(Some(MIN_PAGE), |side| {
        (*side < MAX_PAGE).then_some(side * 2)
    })
    .collect();

    let mut sizes: Vec<(u32, u32)> = sides
        .iter()
        .flat_map(|&w| sides.iter().map(move |&h| (w, h)))
        .collect();
    sizes.sort_by_key(|&(w, h)| {
        (
            u64::from(w) * u64::from(h),
            w.ilog2().abs_diff(h.ilog2()),
            Reverse(w),
        )
    });
    sizes.into_iter()
}

fn cell(side: u32) -> u32 {
    side + 2 * SPRITE_PADDING
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Rect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

impl Rect {
    fn right(self) -> u32 {
        self.x + self.w
    }

    fn bottom(self) -> u32 {
        self.y + self.h
    }

    fn overlaps(self, other: Rect) -> bool {
        self.x < other.right()
            && other.x < self.right()
            && self.y < other.bottom()
            && other.y < self.bottom()
    }

    fn contains(self, other: Rect) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }
}

/// MaxRects with the best short side fit around the sprites `held` already places, and none where
/// a sprite does not fit.
fn place(
    sprites: &[&PackSprite],
    held: &[Placement],
    width: u32,
    height: u32,
) -> Option<Vec<Placement>> {
    let mut free = vec![Rect {
        x: 0,
        y: 0,
        w: width,
        h: height,
    }];
    for placement in held {
        split(
            &mut free,
            Rect {
                x: placement.x - SPRITE_PADDING,
                y: placement.y - SPRITE_PADDING,
                w: cell(placement.width),
                h: cell(placement.height),
            },
        );
    }
    let mut placements = Vec::with_capacity(sprites.len());

    for sprite in sprites {
        let (w, h) = (cell(sprite.width), cell(sprite.height));
        let spot = free
            .iter()
            .filter(|r| r.w >= w && r.h >= h)
            .min_by_key(|r| {
                let (dw, dh) = (r.w - w, r.h - h);
                (dw.min(dh), dw.max(dh), r.y, r.x)
            })
            .copied()?;

        let used = Rect {
            x: spot.x,
            y: spot.y,
            w,
            h,
        };
        split(&mut free, used);
        placements.push(Placement {
            key: sprite.key.clone(),
            x: used.x + SPRITE_PADDING,
            y: used.y + SPRITE_PADDING,
            width: sprite.width,
            height: sprite.height,
        });
    }
    Some(placements)
}

/// The free rects less `used`: each one it overlaps splits into the parts around it, and a rect
/// another holds whole is dropped.
fn split(free: &mut Vec<Rect>, used: Rect) {
    let mut next = Vec::with_capacity(free.len() + 4);
    for &rect in free.iter() {
        if !rect.overlaps(used) {
            next.push(rect);
            continue;
        }

        if used.x > rect.x {
            next.push(Rect {
                w: used.x - rect.x,
                ..rect
            });
        }
        if used.right() < rect.right() {
            next.push(Rect {
                x: used.right(),
                w: rect.right() - used.right(),
                ..rect
            });
        }
        if used.y > rect.y {
            next.push(Rect {
                h: used.y - rect.y,
                ..rect
            });
        }
        if used.bottom() < rect.bottom() {
            next.push(Rect {
                y: used.bottom(),
                h: rect.bottom() - used.bottom(),
                ..rect
            });
        }
    }

    let kept: Vec<Rect> = next
        .iter()
        .enumerate()
        .filter(|&(at, rect)| {
            !next.iter().enumerate().any(|(other_at, other)| {
                other_at != at && other.contains(*rect) && (other != rect || other_at < at)
            })
        })
        .map(|(_, rect)| *rect)
        .collect();
    *free = kept;
}

/// A sprite's RGBA pixels, row by row.
pub struct SpritePixels<'a> {
    pub width: u32,
    pub height: u32,
    pub rgba: &'a [u8],
}

/// The page's RGBA pixels: each sprite at its placement, its edge pixels repeated across its
/// padding, and nothing elsewhere. `pixels` answers a placement's key.
pub fn compose<'a>(
    packed: &Packed,
    mut pixels: impl FnMut(&str) -> Option<SpritePixels<'a>>,
) -> Vec<u8> {
    let stride = packed.width as usize * 4;
    let mut page = vec![0; stride * packed.height as usize];

    for placement in &packed.placements {
        let Some(sprite) = pixels(&placement.key) else {
            continue;
        };
        if sprite.width != placement.width || sprite.height != placement.height {
            continue;
        }

        let pad = SPRITE_PADDING as i64;
        let (w, h) = (i64::from(sprite.width), i64::from(sprite.height));
        for dy in -pad..h + pad {
            let sy = dy.clamp(0, h - 1) as usize;
            let py = (i64::from(placement.y) + dy) as usize;
            for dx in -pad..w + pad {
                let sx = dx.clamp(0, w - 1) as usize;
                let px = (i64::from(placement.x) + dx) as usize;
                let from = (sy * sprite.width as usize + sx) * 4;
                let to = py * stride + px * 4;
                page[to..to + 4].copy_from_slice(&sprite.rgba[from..from + 4]);
            }
        }
    }
    page
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sprite(key: &str, width: u32, height: u32) -> PackSprite {
        PackSprite {
            key: key.into(),
            width,
            height,
        }
    }

    #[test]
    fn sprites_pack_apart_and_inside_the_page_by_their_padding() {
        let sprites = [
            sprite("a", 100, 40),
            sprite("b", 30, 30),
            sprite("c", 60, 12),
        ];
        let packed = pack(&sprites).unwrap();

        assert!(packed.width.is_power_of_two() && packed.height.is_power_of_two());
        for (at, one) in packed.placements.iter().enumerate() {
            assert!(one.x >= SPRITE_PADDING && one.y >= SPRITE_PADDING);
            assert!(one.x + one.width + SPRITE_PADDING <= packed.width);
            assert!(one.y + one.height + SPRITE_PADDING <= packed.height);

            for other in &packed.placements[at + 1..] {
                let apart_x = one.x + one.width + 2 * SPRITE_PADDING <= other.x
                    || other.x + other.width + 2 * SPRITE_PADDING <= one.x;
                let apart_y = one.y + one.height + 2 * SPRITE_PADDING <= other.y
                    || other.y + other.height + 2 * SPRITE_PADDING <= one.y;
                assert!(apart_x || apart_y, "{} and {} touch", one.key, other.key);
            }
        }
    }

    #[test]
    fn the_same_sprites_pack_the_same_in_any_order() {
        let sprites = [sprite("a", 20, 20), sprite("b", 20, 20), sprite("c", 50, 8)];
        let reversed: Vec<_> = sprites.iter().rev().cloned().collect();

        assert_eq!(pack(&sprites).unwrap(), pack(&reversed).unwrap());
    }

    #[test]
    fn a_page_is_the_smallest_power_of_two_that_holds_the_sprites() {
        let packed = pack(&[sprite("a", 12, 12)]).unwrap();
        assert_eq!((packed.width, packed.height), (16, 16));

        let wide = pack(&[sprite("bar", 300, 10)]).unwrap();
        assert_eq!((wide.width, wide.height), (512, 16));
    }

    #[test]
    fn a_sprite_packed_into_a_page_leaves_every_placed_one_where_it_was() {
        let first = pack(&[sprite("a", 12, 12)]).unwrap();
        let grown = pack_into(&first, &[sprite("b", 40, 12)]).unwrap();

        assert_eq!(grown.placements[0], first.placements[0]);
        assert!(grown.width >= first.width && grown.height >= first.height);
        assert!(grown.width * grown.height > first.width * first.height);

        let b = &grown.placements[1];
        let a = &grown.placements[0];
        assert!(
            b.x >= a.x + a.width + 2 * SPRITE_PADDING || b.y >= a.y + a.height + 2 * SPRITE_PADDING
        );
    }

    #[test]
    fn sprites_too_large_for_one_page_or_without_pixels_are_refused() {
        assert_eq!(pack(&[sprite("a", 2046, 10)]), Err(PackError::TooLarge));
        assert_eq!(
            pack(&[sprite("a", 0, 10)]),
            Err(PackError::Unsized { key: "a".into() })
        );
        assert_eq!(pack(&[]), Err(PackError::Empty));
    }

    #[test]
    fn a_composed_page_repeats_a_sprites_edges_across_its_padding() {
        let packed = pack(&[sprite("a", 2, 1)]).unwrap();
        let rgba = [1, 1, 1, 255, 2, 2, 2, 255];
        let page = compose(&packed, |_| {
            Some(SpritePixels {
                width: 2,
                height: 1,
                rgba: &rgba,
            })
        });

        let at = |x: usize, y: usize| page[(y * packed.width as usize + x) * 4];
        let placed = &packed.placements[0];
        let (x, y) = (placed.x as usize, placed.y as usize);
        assert_eq!(at(x, y), 1);
        assert_eq!(at(x + 1, y), 2);
        assert_eq!(at(x - 2, y - 2), 1);
        assert_eq!(at(x + 3, y + 2), 2);
        assert_eq!(at(x + 4, y), 0);
    }
}
