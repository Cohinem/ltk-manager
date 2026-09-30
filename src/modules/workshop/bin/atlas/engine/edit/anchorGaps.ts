/**
 * The edge of its frame an element keeps its distance to on one axis: the start (left or top),
 * the centre, or the end (right or bottom).
 */
export type AnchorEdge = "start" | "centre" | "end";

/** The edge an anchor's fraction along an axis holds, the nearest of the three. */
export function edgeOf(fraction: number): AnchorEdge {
  if (fraction < 0.25) return "start";
  if (fraction > 0.75) return "end";
  return "centre";
}

/**
 * The distance a single-anchored element keeps to `edge`, in its design frame's pixels: from the
 * frame's start to its own, from the frame's centre to its own, or from its own end to the frame's.
 * `position` and `size` are the rect's along the axis and `source` the design frame's span.
 */
export function gapOf(position: number, size: number, source: number, edge: AnchorEdge): number {
  switch (edge) {
    case "start":
      return position;
    case "centre":
      return position + size / 2 - source / 2;
    case "end":
      return source - position - size;
  }
}

/** The position that puts an element of `size` at `gap` from `edge`, the inverse of `gapOf`. */
export function positionOf(gap: number, size: number, source: number, edge: AnchorEdge): number {
  switch (edge) {
    case "start":
      return gap;
    case "centre":
      return gap - size / 2 + source / 2;
    case "end":
      return source - size - gap;
  }
}
