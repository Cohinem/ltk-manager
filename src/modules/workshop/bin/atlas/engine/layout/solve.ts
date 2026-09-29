import type { ViewTree } from "../model/tree";
import type { ViewAnchor, ViewPosition, ViewRect } from "../model/view";
import { restsHidden } from "../model/visibility";
import { arrange, type Edges, type LayoutItem } from "./managed";

/** A screen size in pixels. */
export interface Screen {
  readonly width: number;
  readonly height: number;
}

/** A safe zone in fractions of the screen. */
export interface SafeZone {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** What a layout solves against. */
export interface LayoutSettings {
  readonly screen: Screen;
  /** The client's HUD scale factor, 0.66 at the smallest setting and 1 at the largest. */
  readonly hud: number;
  readonly safeZone: SafeZone;
}

/** A rect in screen pixels, top-left origin. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const FULL_SAFE_ZONE: SafeZone = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** `AnchorHierarchy`'s align and pivot values as fractions, 3 stretching. */
export const HIERARCHY_FRACTION = [0, 0.5, 1] as const;
export const HIERARCHY_STRETCH = 3;

/** A rect the solver has placed but not yet moved by any layout or snapped. */
interface Natural {
  readonly edges: Edges;
  readonly snap: readonly [boolean, boolean];
}

/**
 * Every element's rect on `settings.screen`, per "Layout" in docs/research/ui-data-layout.md.
 *
 * Each positioned element is placed on its own, a hierarchy-anchored one inside the nearest
 * positioned group above it. Every managed layout then moves its children, innermost first, and
 * an element moves by its own offset and every offset above it (`0x1413B0DD0`). A group without
 * a position takes the union of its children's rects, as the client measures it.
 */
export function solve(tree: ViewTree, settings: LayoutSettings): Map<string, PixelRect> {
  const screen: Edges = { x0: 0, y0: 0, x1: settings.screen.width, y1: settings.screen.height };
  const natural = naturalRects(tree, settings, screen);
  const offsets = layoutOffsets(tree, natural);
  const shiftOf = (key: string) => shift(tree, offsets, key);

  const solved = new Map<string, PixelRect>();
  const visiting = new Set<string>();
  const rectOf = (key: string): PixelRect | null => {
    const held = solved.get(key);
    if (held !== undefined) return held;
    if (visiting.has(key)) return null;

    visiting.add(key);
    const own = natural.get(key);
    let rect: PixelRect | null = null;
    if (own !== undefined) {
      const [dx, dy] = shiftOf(key);
      rect = snapped(moved(own.edges, dx, dy), own.snap);
    } else {
      rect = unionOf(childrenOf(tree, key).map(rectOf));
    }
    visiting.delete(key);

    if (rect !== null) solved.set(key, rect);
    return rect;
  };

  for (const key of tree.elements.keys()) {
    if (rectOf(key) === null) solved.set(key, toPixels(frameOf(tree, natural, key, screen)));
  }
  return solved;
}

/** One `UiPositionRect` on the screen, `parent` being the rect an `AnchorHierarchy` places in. */
export function solveRect(rect: ViewRect, parent: PixelRect, settings: LayoutSettings): PixelRect {
  const frame = { x0: parent.x, y0: parent.y, x1: parent.x + parent.w, y1: parent.y + parent.h };
  return snapped(solveEdges(rect, frame, settings), snapsOf(rect));
}

/** Each positioned element's rect, before any layout moves it. */
function naturalRects(
  tree: ViewTree,
  settings: LayoutSettings,
  screen: Edges,
): Map<string, Natural> {
  const natural = new Map<string, Natural>();
  const solving = new Set<string>();

  const place = (key: string): Natural | null => {
    const held = natural.get(key);
    if (held !== undefined) return held;

    const position = tree.elements.get(key)?.position ?? null;
    if (position === null || solving.has(key)) return null;

    solving.add(key);
    const frame = positionedAncestor(tree, key, place) ?? screen;
    const placed = placePosition(position, frame, screen, settings);
    solving.delete(key);

    natural.set(key, placed);
    return placed;
  };

  for (const key of tree.elements.keys()) place(key);
  return natural;
}

/** The rect of the nearest group above `key` that has a position of its own. */
function positionedAncestor(
  tree: ViewTree,
  key: string,
  place: (key: string) => Natural | null,
): Edges | null {
  const seen = new Set<string>([key]);
  let at = tree.groupOf.get(key);
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const placed = place(at);
    if (placed !== null) return placed.edges;
    at = tree.groupOf.get(at);
  }
  return null;
}

function placePosition(
  position: ViewPosition,
  frame: Edges,
  screen: Edges,
  settings: LayoutSettings,
): Natural {
  switch (position.kind) {
    case "fullScreen":
      return { edges: screen, snap: [false, false] };
    case "rect":
    case "polygon":
      return { edges: solveEdges(position.rect, frame, settings), snap: snapsOf(position.rect) };
  }
}

/** The client's rect solve (`0x1413B2860`) in pixels, before snapping. */
function solveEdges(rect: ViewRect, frame: Edges, settings: LayoutSettings): Edges {
  const { screen } = settings;
  const [sourceW, sourceH] = sourceOf(rect, screen);
  const [w, h] = clampedSize(rect);
  const zone = rect.ignoreSafeZone ? FULL_SAFE_ZONE : settings.safeZone;
  const k = zone.y1 - zone.y0;
  const g = scaleOf(rect, sourceH, settings);

  if (rect.anchor.kind === "hierarchy") {
    const corner = [zone.x0 * screen.width, zone.y0 * screen.height] as const;
    return placeInParent(rect, rect.anchor, frame, corner, (screen.height / sourceH) * k, g);
  }

  /* The HUD scale about the anchor, then the screen scale about it with the anchor placed in
     the safe zone, which is the client's two steps folded into one. */
  const kx = (k * (sourceW / sourceH)) / (screen.width / screen.height);
  const [near, far] = anchorsOf(rect.anchor);
  const edgeX = (value: number, anchor: number) =>
    (value - anchor) * g * kx + lerp(zone.x0, zone.x1, anchor);
  const edgeY = (value: number, anchor: number) =>
    (value - anchor) * g * k + lerp(zone.y0, zone.y1, anchor);

  const [x, y] = rect.position;
  return {
    x0: edgeX(x / sourceW, near[0]) * screen.width,
    x1: edgeX((x + w) / sourceW, far[0]) * screen.width,
    y0: edgeY(y / sourceH, near[1]) * screen.height,
    y1: edgeY((y + h) / sourceH, far[1]) * screen.height,
  };
}

/**
 * The scale an element takes: the HUD scale, 1 where it ignores it, and under
 * `DisableResolutionDownscale` whatever keeps it from drawing below its source size.
 */
export function scaleOf(rect: ViewRect, sourceH: number, settings: LayoutSettings): number {
  if (rect.disableResolutionDownscale) return Math.max(sourceH / settings.screen.height, 1);
  return rect.ignoreGlobalScale ? 1 : settings.hud;
}

/**
 * An `AnchorHierarchy` rect inside `frame`, per `0x1413B2860`.
 *
 * Its anchor is the origin, so the position scales with the screen from the safe zone's corner
 * and lands at the parent's start, centre or end less the pivot's share of the element's size.
 * A stretched axis takes the parent's span less its margins, which scale with the screen alone.
 */
function placeInParent(
  rect: ViewRect,
  anchor: Extract<ViewAnchor, { kind: "hierarchy" }>,
  frame: Edges,
  corner: readonly [number, number],
  unit: number,
  scale: number,
): Edges {
  const size = clampedSize(rect);

  const axis = (at: 0 | 1) => {
    const start = at === 0 ? frame.x0 : frame.y0;
    const end = at === 0 ? frame.x1 : frame.y1;
    const [near, far] = anchor.margins[at];
    if (anchor.align[at] === HIERARCHY_STRETCH) {
      return [start + near * unit, end - far * unit] as const;
    }

    const length = size[at] * scale * unit;
    const align = HIERARCHY_FRACTION[anchor.align[at]] ?? 0;
    const pivot = HIERARCHY_FRACTION[anchor.pivot[at]] ?? 0;
    const from =
      start +
      corner[at] +
      rect.position[at] * scale * unit +
      (end - start) * align -
      length * pivot;
    return [from, from + length] as const;
  };

  const [x0, x1] = axis(0);
  const [y0, y1] = axis(1);
  return { x0, y0, x1, y1 };
}

/** The offset each child of a managed layout takes, the innermost layouts placed first. */
function layoutOffsets(
  tree: ViewTree,
  natural: ReadonlyMap<string, Natural>,
): Map<string, readonly [number, number]> {
  const offsets = new Map<string, readonly [number, number]>();
  const layouts = [...tree.elements.values()]
    .filter((element) => element.look.kind === "group" && element.look.layout !== null)
    .map((element) => element.key)
    .sort((a, b) => depthOf(tree, b) - depthOf(tree, a));

  for (const key of layouts) {
    const look = tree.elements.get(key)?.look;
    if (look?.kind !== "group" || look.layout === null) continue;

    const layout = look.layout;
    const region = layout.region;
    const regionRect = region === null ? null : measure(tree, natural, offsets, region, false);
    if (regionRect === null) continue;

    const items: LayoutItem[] = [];
    for (const child of childrenOf(tree, key)) {
      if (child === region) continue;

      offsets.delete(child);
      const rect = measure(tree, natural, offsets, child, layout.ignoreDisabled);
      if (rect !== null) items.push({ key: child, rect });
    }

    for (const [child, offset] of arrange(layout, regionRect, items)) offsets.set(child, offset);
  }
  return offsets;
}

/**
 * An element's rect as a layout measures it: its own, moved by the offsets so far, or a group's
 * union of its children's. Where the layout ignores disabled elements, one the preview leaves
 * undrawn measures as nothing. The file leaves most elements' `Enabled` for the controller, and
 * the preview draws those, so they take their place in the layout.
 */
function measure(
  tree: ViewTree,
  natural: ReadonlyMap<string, Natural>,
  offsets: ReadonlyMap<string, readonly [number, number]>,
  key: string,
  ignoreDisabled: boolean,
  seen: Set<string> = new Set(),
): Edges | null {
  const element = tree.elements.get(key);
  if (element === undefined || seen.has(key)) return null;
  if (ignoreDisabled && restsHidden(element)) return null;

  seen.add(key);
  if (element.look.kind === "group") {
    const children = childrenOf(tree, key).map((child) =>
      measure(tree, natural, offsets, child, ignoreDisabled, seen),
    );
    const union = unionOfEdges(children);
    if (union !== null) return union;
  }

  const own = natural.get(key);
  if (own === undefined) return null;

  const [dx, dy] = shift(tree, offsets, key);
  return moved(own.edges, dx, dy);
}

/** The offset `key` moves by: its own and every group's above it. */
function shift(
  tree: ViewTree,
  offsets: ReadonlyMap<string, readonly [number, number]>,
  key: string,
): readonly [number, number] {
  let dx = 0;
  let dy = 0;
  const seen = new Set<string>();
  let at: string | undefined = key;
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const offset = offsets.get(at);
    if (offset !== undefined) {
      dx += offset[0];
      dy += offset[1];
    }
    at = tree.groupOf.get(at);
  }
  return [dx, dy];
}

/** The rect an element with no rect of its own and no children falls back to. */
function frameOf(
  tree: ViewTree,
  natural: ReadonlyMap<string, Natural>,
  key: string,
  screen: Edges,
): Edges {
  return positionedAncestor(tree, key, (at) => natural.get(at) ?? null) ?? screen;
}

/** The children a group lists that name it as their group. */
function childrenOf(tree: ViewTree, key: string): string[] {
  const look = tree.elements.get(key)?.look;
  if (look?.kind !== "group") return [];

  return look.children.filter((child) => tree.groupOf.get(child) === key);
}

function depthOf(tree: ViewTree, key: string): number {
  let depth = 0;
  const seen = new Set<string>();
  let at = tree.groupOf.get(key);
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    depth += 1;
    at = tree.groupOf.get(at);
  }
  return depth;
}

/** The near-edge and far-edge anchors. A single anchor holds both edges. */
function anchorsOf(
  anchor: ViewAnchor,
): readonly [readonly [number, number], readonly [number, number]] {
  switch (anchor.kind) {
    case "single":
      return [anchor.anchor, anchor.anchor];
    case "double":
      return [anchor.left, anchor.right];
    case "none":
    case "hierarchy":
      return [ORIGIN, ORIGIN];
  }
}

const ORIGIN: readonly [number, number] = [0, 0];

/** The source resolution, the screen's where the file leaves either side 0. */
export function sourceOf(rect: ViewRect, screen: Screen): [number, number] {
  const [width, height] = rect.source;
  if (width > 0 && height > 0) return [width, height];

  return [screen.width, screen.height];
}

/** `Size` clamped to `MinSize` and `MaxSize`, in source pixels. */
function clampedSize(rect: ViewRect): [number, number] {
  return [0, 1].map((at) =>
    Math.min(Math.max(rect.size[at] ?? 0, rect.minSize[at] ?? 0), rect.maxSize[at] ?? Infinity),
  ) as [number, number];
}

function snapsOf(rect: ViewRect): readonly [boolean, boolean] {
  return [!rect.disablePixelSnapping[0], !rect.disablePixelSnapping[1]];
}

function moved(edges: Edges, dx: number, dy: number): Edges {
  return { x0: edges.x0 + dx, y0: edges.y0 + dy, x1: edges.x1 + dx, y1: edges.y1 + dy };
}

/** `edges` as a rect, each edge rounded to a pixel on the axes that snap. */
function snapped(edges: Edges, snap: readonly [boolean, boolean]): PixelRect {
  const [snapX, snapY] = snap.map((on) => (on ? Math.round : (value: number) => value)) as [
    (value: number) => number,
    (value: number) => number,
  ];
  const x = snapX(edges.x0);
  const y = snapY(edges.y0);
  return { x, y, w: snapX(edges.x1) - x, h: snapY(edges.y1) - y };
}

function toPixels(edges: Edges): PixelRect {
  return { x: edges.x0, y: edges.y0, w: edges.x1 - edges.x0, h: edges.y1 - edges.y0 };
}

function unionOfEdges(rects: readonly (Edges | null)[]): Edges | null {
  let union: Edges | null = null;
  for (const rect of rects) {
    if (rect === null) continue;

    union =
      union === null
        ? rect
        : {
            x0: Math.min(union.x0, rect.x0),
            y0: Math.min(union.y0, rect.y0),
            x1: Math.max(union.x1, rect.x1),
            y1: Math.max(union.y1, rect.y1),
          };
  }
  return union;
}

function unionOf(rects: readonly (PixelRect | null)[]): PixelRect | null {
  const union = unionOfEdges(
    rects.map((rect) =>
      rect === null ? null : { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h },
    ),
  );
  return union === null ? null : toPixels(union);
}

function lerp(from: number, to: number, at: number): number {
  return from + (to - from) * at;
}
