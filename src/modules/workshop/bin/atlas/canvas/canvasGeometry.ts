import type { SnapLine, SnapLines } from "../engine/edit/snap";
import { siblingsOf } from "../engine/edit/targets";
import type { PixelRect, Screen } from "../engine/layout/solve";
import type { ViewTree } from "../engine/model/tree";
import { SAFE_ZONE_INSET } from "../state/atlasPreview";

/** A corner or side of a rect a resize drags. */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Point = readonly [number, number];

/** A handle's point on `rect`, in screen pixels. */
export function handlePoint(rect: PixelRect, handle: Handle): Point {
  return [
    along(rect.x, rect.w, handle.includes("w"), handle.includes("e")),
    along(rect.y, rect.h, handle.includes("n"), handle.includes("s")),
  ];
}

/** The near end, the far end or the middle of a span. */
function along(start: number, length: number, near: boolean, far: boolean): number {
  if (near) return start;
  if (far) return start + length;
  return start + length / 2;
}

/** `rect` with the edges `handle` drags moved by `dx, dy`, never narrower than a pixel. */
export function resized(rect: PixelRect, handle: Handle, [dx, dy]: Point): PixelRect {
  let x0 = rect.x;
  let y0 = rect.y;
  let x1 = rect.x + rect.w;
  let y1 = rect.y + rect.h;
  if (handle.includes("w")) x0 = Math.min(x0 + dx, x1 - 1);
  if (handle.includes("e")) x1 = Math.max(x1 + dx, x0 + 1);
  if (handle.includes("n")) y0 = Math.min(y0 + dy, y1 - 1);
  if (handle.includes("s")) y1 = Math.max(y1 + dy, y0 + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The lines a resize from `handle` snaps: the edges it drags. */
export function linesOf(handle: Handle): SnapLines {
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  if (handle.includes("w")) x.push("start");
  if (handle.includes("e")) x.push("end");
  if (handle.includes("n")) y.push("start");
  if (handle.includes("s")) y.push("end");
  return [x, y];
}

export function rectsOf(
  shown: ReadonlyMap<string, PixelRect>,
  keys: readonly string[],
): PixelRect[] {
  return keys.flatMap((key) => {
    const rect = shown.get(key);
    return rect === undefined ? [] : [rect];
  });
}

export function unionOf(rects: readonly PixelRect[]): PixelRect | null {
  if (rects.length === 0) return null;

  const x0 = Math.min(...rects.map((rect) => rect.x));
  const y0 = Math.min(...rects.map((rect) => rect.y));
  const x1 = Math.max(...rects.map((rect) => rect.x + rect.w));
  const y1 = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function spanning(from: Point, to: Point): PixelRect {
  const x = Math.min(from[0], to[0]);
  const y = Math.min(from[1], to[1]);
  return { x, y, w: Math.abs(to[0] - from[0]), h: Math.abs(to[1] - from[1]) };
}

export function shift(rect: PixelRect, [dx, dy]: Point): PixelRect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

export function contains(rect: PixelRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

export function within(inner: PixelRect, outer: PixelRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * What a drag of `keys` snaps to: the screen, the safe zone where it is shown, and the drawn
 * siblings and parent group of each key that are not moving with it.
 */
export function snapTargetsOf(
  tree: ViewTree,
  shown: ReadonlyMap<string, PixelRect>,
  keys: readonly string[],
  moving: ReadonlySet<string>,
  screen: Screen,
  safeZone: boolean,
): PixelRect[] {
  const { width, height } = screen;
  const targets: PixelRect[] = [{ x: 0, y: 0, w: width, h: height }];
  if (safeZone) {
    targets.push({
      x: width * SAFE_ZONE_INSET,
      y: height * SAFE_ZONE_INSET,
      w: width * (1 - 2 * SAFE_ZONE_INSET),
      h: height * (1 - 2 * SAFE_ZONE_INSET),
    });
  }

  const near = new Set<string>();
  for (const key of keys) {
    for (const sibling of siblingsOf(tree, key)) near.add(sibling);
    const group = tree.groupOf.get(key);
    if (group !== undefined) near.add(group);
  }
  for (const key of near) {
    const rect = shown.get(key);
    if (rect !== undefined && !moving.has(key) && rect.w > 0 && rect.h > 0) targets.push(rect);
  }
  return targets;
}
