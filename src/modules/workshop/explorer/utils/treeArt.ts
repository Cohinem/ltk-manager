/**
 * What a tree row's height decides while the tree draws thumbnails: the art's slot, its plate,
 * and the width it is asked for.
 */

import {
  EXPLORER_TILE_SIZES,
  EXPLORER_TREE_ROW_HEIGHTS,
  type ExplorerArtShape,
  type ExplorerTreeRowHeight,
} from "@/stores";

import { artBoxFor } from "./detailsRow";

/** The widest an original-ratio plate draws, as a multiple of its height. */
export const MAX_ART_ASPECT = 2;

/** The narrowest, so a tall strip still draws a plate wide enough to read. */
export const MIN_ART_ASPECT = 0.5;

/** The width the art's slot reserves, so every name of the tree starts on one column. */
export function artSlotWidth(box: number, shape: ExplorerArtShape): number {
  return shape === "square" ? box : box * MAX_ART_ASPECT;
}

/** The plate's width around an image of `aspect`, its width over its height. */
export function originalArtWidth(box: number, aspect: number): number {
  return Math.round(box * Math.min(MAX_ART_ASPECT, Math.max(MIN_ART_ASPECT, aspect)));
}

/** The smallest tile size the slot fits in, so the tree adds no width to the six a session asks for. */
export function treeArtRequestWidth(rowHeight: number, shape: ExplorerArtShape): number {
  const wanted = artSlotWidth(artBoxFor(rowHeight), shape);
  return EXPLORER_TILE_SIZES.find((size) => size >= wanted) ?? EXPLORER_TILE_SIZES.at(-1)!;
}

/** The declared height nearest what the slider landed on. */
export function nearestTreeRowHeight(value: number): ExplorerTreeRowHeight {
  return EXPLORER_TREE_ROW_HEIGHTS.reduce((best, height) =>
    Math.abs(height - value) < Math.abs(best - value) ? height : best,
  );
}
