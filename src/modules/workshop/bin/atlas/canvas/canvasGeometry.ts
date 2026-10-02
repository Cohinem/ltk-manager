import type { SnapLine, SnapLines } from "../engine/edit/snap";
import { siblingsOf } from "../engine/edit/targets";
import type { PixelRect } from "../engine/layout/solve";
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

/** The safe zone of a screen drawn at `frame`. */
export function safeZoneOf(frame: PixelRect): PixelRect {
  return {
    x: frame.x + frame.w * SAFE_ZONE_INSET,
    y: frame.y + frame.h * SAFE_ZONE_INSET,
    w: frame.w * (1 - 2 * SAFE_ZONE_INSET),
    h: frame.h * (1 - 2 * SAFE_ZONE_INSET),
  };
}

export function contains(rect: PixelRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

/** The elements of `order`, drawn bottom first, whose rect holds `x, y`, topmost first. */
export function elementsAt(
  order: readonly string[],
  rects: ReadonlyMap<string, PixelRect>,
  x: number,
  y: number,
): string[] {
  const under: string[] = [];
  for (let at = order.length - 1; at >= 0; at -= 1) {
    const key = order[at];
    const rect = key === undefined ? undefined : rects.get(key);
    if (key !== undefined && rect !== undefined && contains(rect, x, y)) under.push(key);
  }
  return under;
}

/** Whether a click at `client` repeats `last` on `current`, within `reach` pixels of it. */
export function repeatsClick(
  last: { readonly client: Point; readonly element: string | null } | null,
  client: Point,
  current: string | null,
  reach: number,
): boolean {
  if (last === null || last.element !== current) return false;
  return Math.hypot(client[0] - last.client[0], client[1] - last.client[1]) <= reach;
}

/**
 * The element a click on the stack `under` selects: the one below `current` where the click
 * repeats on the spot it last picked `current` at, wrapping to the top, and the topmost otherwise.
 */
export function clickedIn(
  under: readonly string[],
  current: string | null,
  repeat: boolean,
): string | null {
  const at = current === null ? -1 : under.indexOf(current);
  if (!repeat || at < 0) return under[0] ?? null;
  return under[(at + 1) % under.length] ?? null;
}

/**
 * The element a drag from `x, y` moves: a selected one of `under`, else the primary selection where
 * the selection's bounds hold the point, as a group's or a scene's do around the gaps between its
 * elements, else the topmost of `under`.
 */
export function grabbedIn(
  under: readonly string[],
  selection: readonly string[],
  rects: ReadonlyMap<string, PixelRect>,
  x: number,
  y: number,
): string | null {
  const picked = under.find((key) => selection.includes(key));
  if (picked !== undefined) return picked;

  const bounds = unionOf(rectsOf(rects, selection));
  if (bounds !== null && contains(bounds, x, y)) return selection.at(-1) ?? null;
  return under[0] ?? null;
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
 * What a drag of `keys` snaps to: the screen they are drawn on as `frame`, the safe zone where it
 * is shown, and the drawn siblings and parent group of each key that are not moving with it.
 */
export function snapTargetsOf(
  tree: ViewTree,
  shown: ReadonlyMap<string, PixelRect>,
  keys: readonly string[],
  moving: ReadonlySet<string>,
  frame: PixelRect,
  safeZone: boolean,
): PixelRect[] {
  const targets: PixelRect[] = [frame];
  if (safeZone) targets.push(safeZoneOf(frame));

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

/** The pointer a resize handle shows, or the default one away from every handle. */
export function cursorOf(handle: Handle | null): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case null:
      return "default";
  }
}
