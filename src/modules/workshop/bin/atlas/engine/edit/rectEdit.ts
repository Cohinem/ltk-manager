import {
  FULL_SAFE_ZONE,
  HIERARCHY_FRACTION,
  HIERARCHY_STRETCH,
  type LayoutSettings,
  scaleOf,
  sourceOf,
} from "../layout/solve";
import type { ViewRect } from "../model/view";

/** How far each edge of a rect moves on the screen, in pixels. */
export interface EdgeDelta {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

type Pair = readonly [number, number];

/** What a rect edit writes: `UIRect`'s position and size, and a hierarchy anchor's margins. */
export interface RectFields {
  readonly position: Pair;
  readonly size: Pair;
  /** Null for any anchor but `AnchorHierarchy`. */
  readonly margins: readonly [Pair, Pair] | null;
}

/** An edge delta that moves a rect by `dx, dy` without resizing it. */
export function moveDelta(dx: number, dy: number): EdgeDelta {
  return { x0: dx, y0: dy, x1: dx, y1: dy };
}

export function rectFields(rect: ViewRect): RectFields {
  return {
    position: rect.position,
    size: rect.size,
    margins: rect.anchor.kind === "hierarchy" ? rect.anchor.margins : null,
  };
}

/**
 * The fields that move `rect`'s edges on the screen by `delta`, the inverse of the solver's rect
 * solve (`0x1413B2860`).
 *
 * The solve is linear on each axis, so a change of edges is a change of fields scaled by how many
 * screen pixels one source pixel covers. The parent rect, the safe zone's corner and any managed
 * layout's offset cancel out, and no placement is needed. A stretched hierarchy axis moves its
 * margins, which scale with the screen alone. `snap` rounds what changed to whole source pixels.
 */
export function retarget(
  rect: ViewRect,
  settings: LayoutSettings,
  delta: EdgeDelta,
  snap: boolean,
): RectFields {
  const { perSource, perMargin } = screenRates(rect, settings);
  const round = (value: number) => (snap ? Math.round(value) : value);
  const anchor = rect.anchor;
  const position: [number, number] = [...rect.position];
  const size: [number, number] = [...rect.size];
  let margins: [[number, number], [number, number]] | null = null;
  if (anchor.kind === "hierarchy") {
    margins = [[...anchor.margins[0]], [...anchor.margins[1]]];
  }

  for (const at of [0, 1] as const) {
    const from = at === 0 ? delta.x0 : delta.y0;
    const to = at === 0 ? delta.x1 : delta.y1;
    if (from === 0 && to === 0) continue;

    if (anchor.kind === "hierarchy" && margins !== null && anchor.align[at] === HIERARCHY_STRETCH) {
      const [near, far] = margins[at];
      margins[at] = [round(near + from / perMargin), round(far - to / perMargin)];
      continue;
    }

    const grown = (to - from) / perSource[at];
    const pivot = anchor.kind === "hierarchy" ? (HIERARCHY_FRACTION[anchor.pivot[at]] ?? 0) : 0;
    position[at] = round(position[at] + from / perSource[at] + grown * pivot);
    size[at] = Math.max(0, round(size[at] + grown));
  }

  return { position, size, margins };
}

/**
 * How many screen pixels one source pixel of `rect` covers on each axis, and one margin unit of a
 * stretched hierarchy axis.
 */
export function screenRates(
  rect: ViewRect,
  settings: LayoutSettings,
): { readonly perSource: Pair; readonly perMargin: number } {
  const { screen } = settings;
  const [sourceW, sourceH] = sourceOf(rect, screen);
  const zone = rect.ignoreSafeZone ? FULL_SAFE_ZONE : settings.safeZone;
  const k = zone.y1 - zone.y0;
  const g = scaleOf(rect, sourceH, settings);
  const unit = (screen.height / sourceH) * k;

  if (rect.anchor.kind === "hierarchy") {
    return { perSource: [g * unit, g * unit], perMargin: unit };
  }

  const kx = (k * (sourceW / sourceH)) / (screen.width / screen.height);
  return {
    perSource: [(g * kx * screen.width) / sourceW, (g * k * screen.height) / sourceH],
    perMargin: unit,
  };
}
