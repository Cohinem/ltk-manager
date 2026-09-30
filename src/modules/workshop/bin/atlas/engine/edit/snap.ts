import type { PixelRect } from "../layout/solve";

/** A line of a rect on one axis: its near edge, its centre or its far edge. */
export type SnapLine = "start" | "centre" | "end";

/** The lines of a rect each axis snaps: every line for a move, the dragged edge for a resize. */
export type SnapLines = readonly [readonly SnapLine[], readonly SnapLine[]];

export const ALL_LINES: SnapLines = [
  ["start", "centre", "end"],
  ["start", "centre", "end"],
];

/** A line two rects share after a snap, drawn across both. `axis` 0 is a vertical line. */
export interface SnapGuide {
  readonly axis: 0 | 1;
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

export interface Snapped {
  /** How far to move the snapping lines on each axis, in screen pixels. */
  readonly offset: readonly [number, number];
  readonly guides: readonly SnapGuide[];
}

/** Two lines closer than this in screen pixels read as one guide. */
const SAME_LINE = 0.5;

/**
 * The offset that lands the nearest of `moving`'s `lines` on an edge or centre of a target,
 * per axis and within `threshold` screen pixels, and the guides of every line that then lands,
 * per "Interaction" in docs/plans/atlas-ui-editor.md.
 */
export function snapRect(
  moving: PixelRect,
  targets: readonly PixelRect[],
  threshold: number,
  lines: SnapLines = ALL_LINES,
): Snapped {
  const offset: [number, number] = [0, 0];
  for (const axis of [0, 1] as const) {
    let best: number | null = null;
    for (const line of lines[axis]) {
      const from = lineOf(moving, axis, line);
      for (const target of targets) {
        for (const to of linesOf(target, axis)) {
          const distance = to - from;
          if (
            Math.abs(distance) <= threshold &&
            (best === null || Math.abs(distance) < Math.abs(best))
          ) {
            best = distance;
          }
        }
      }
    }
    offset[axis] = best ?? 0;
  }

  const landed = shifted(moving, offset);
  const guides: SnapGuide[] = [];
  for (const axis of [0, 1] as const) {
    for (const line of lines[axis]) {
      const at = lineOf(landed, axis, line);
      for (const target of targets) {
        if (!linesOf(target, axis).some((to) => Math.abs(to - at) < SAME_LINE)) continue;

        const cross = axis === 0 ? 1 : 0;
        guides.push({
          axis,
          at,
          from: Math.min(lineOf(landed, cross, "start"), lineOf(target, cross, "start")),
          to: Math.max(lineOf(landed, cross, "end"), lineOf(target, cross, "end")),
        });
      }
    }
  }
  return { offset, guides };
}

function linesOf(rect: PixelRect, axis: 0 | 1): number[] {
  return [lineOf(rect, axis, "start"), lineOf(rect, axis, "centre"), lineOf(rect, axis, "end")];
}

function lineOf(rect: PixelRect, axis: 0 | 1, line: SnapLine): number {
  const start = axis === 0 ? rect.x : rect.y;
  const length = axis === 0 ? rect.w : rect.h;
  switch (line) {
    case "start":
      return start;
    case "centre":
      return start + length / 2;
    case "end":
      return start + length;
  }
}

function shifted(rect: PixelRect, [dx, dy]: readonly [number, number]): PixelRect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}
