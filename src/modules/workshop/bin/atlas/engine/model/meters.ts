import type { PixelRect } from "../layout/solve";
import { sceneOf, type ViewTree } from "./tree";
import type { ViewElement, ViewLook } from "./view";

type GroupLook = Extract<ViewLook, { kind: "group" }>;
export type ViewMeter = NonNullable<GroupLook["meter"]>;
type ViewTip = NonNullable<ViewMeter["tip"]>;

/** The meter a group element is, and none for any other element. */
export function meterOf(element: ViewElement | undefined): ViewMeter | null {
  return element?.look.kind === "group" ? element.look.meter : null;
}

/** What decides the fill a meter draws beside its own `StartPercentage`. */
export interface MeterInput {
  /** The fills the reader set per meter, which win over the rest. */
  readonly own: Readonly<Record<string, number>>;
  /** Each meter draws `live`, as a controller fills it at run time. */
  readonly samples: boolean;
  readonly live: number;
}

/** Each meter's fill, 0 to 1: the reader's own, else `live` while samples draw, else its start. */
export function meterFills(
  tree: ViewTree,
  { own, samples, live }: MeterInput,
): Map<string, number> {
  const fills = new Map<string, number>();
  for (const element of tree.view.elements) {
    const meter = meterOf(element);
    if (meter === null) continue;

    fills.set(element.key, clamp01(own[element.key] ?? (samples ? live : meter.start)));
  }
  return fills;
}

/** The meters whose file leaves `IsEnabled` off, which their controller shows. */
export function disabledMeters(tree: ViewTree): Set<string> {
  const disabled = new Set<string>();
  for (const element of tree.view.elements) {
    if (meterOf(element)?.enabled === false) disabled.add(element.key);
  }
  return disabled;
}

/**
 * Where a bar or tip draws at a meter's fill: the rect it covers, and the part of its width it
 * keeps from each side as the client's crop spells it, `[left, right]`, 1 for the whole of it.
 * The sprite's UVs follow the crop only where the element samples per pixel along X.
 */
export interface MeterCut {
  readonly rect: PixelRect;
  readonly crop: readonly [number, number];
}

/** What every meter of a view draws at its fill. */
export interface MeterDraws {
  readonly cuts: ReadonlyMap<string, MeterCut>;
  /** The tips and slivers the fill hides. */
  readonly hidden: ReadonlySet<string>;
}

export const NO_METER_DRAWS: MeterDraws = { cuts: new Map(), hidden: new Set() };

/** The fill direction the right edge stays fixed in. `0` fills from the left edge. */
const FILLS_LEFTWARD = 1;

/**
 * What every meter of `tree` draws at its fill in `fills`, per "Meters" in
 * docs/research/ui-data-layout.md. A direction other than 0 or 1 draws as authored.
 */
export function meterDraws(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
  fills: ReadonlyMap<string, number>,
): MeterDraws {
  const cuts = new Map<string, MeterCut>();
  const hidden = new Set<string>();

  for (const element of tree.view.elements) {
    const meter = meterOf(element);
    const fill = fills.get(element.key);
    if (meter === null || fill === undefined || meter.direction > FILLS_LEFTWARD) continue;

    const bar = meter.bars.map((key) => solved.get(key)).find(sized);
    if (bar === undefined) continue;

    const leftward = meter.direction === FILLS_LEFTWARD;
    const fillBars = (fraction: number) => {
      for (const key of meter.bars) {
        const rect = solved.get(key);
        if (rect !== undefined) cuts.set(key, cutOf(rect, leftward, fraction));
      }
    };
    const edge = (fraction: number) =>
      leftward ? bar.x + bar.w - bar.w * fraction : bar.x + bar.w * fraction;

    const { tip } = meter;
    if (tip === null) {
      fillBars(fill);
      continue;
    }

    const tips = tip.elements.flatMap((key) => {
      const rect = solved.get(key);
      return rect === undefined || !sized(rect) ? [] : [{ key, rect }];
    });
    const lead = tips[0]?.rect.w ?? 0;

    if (tip.style === "doubleSided") {
      doubleSided(tip, { solved, bar, fill, lead, leftward, tips, cuts, hidden, fillBars, edge });
      continue;
    }

    const share = lead / bar.w;
    const kept = share > 0 && fill < share ? fill / share : 1;
    if (tip.style === "barExtension") {
      const barFill = fill < share ? 0 : fill - share;
      fillBars(barFill);
      for (const each of tips)
        cuts.set(each.key, outside(each.rect, edge(barFill), leftward, kept));
      continue;
    }

    fillBars(fill);
    for (const each of tips) {
      cuts.set(each.key, glowing(each.rect, edge(fill), leftward, kept, tip.glow));
    }
  }
  return { cuts, hidden };
}

interface DoubleSidedInput {
  readonly solved: ReadonlyMap<string, PixelRect>;
  readonly bar: PixelRect;
  readonly fill: number;
  readonly lead: number;
  readonly leftward: boolean;
  readonly tips: readonly { key: string; rect: PixelRect }[];
  readonly cuts: Map<string, MeterCut>;
  readonly hidden: Set<string>;
  readonly fillBars: (fraction: number) => void;
  readonly edge: (fraction: number) => number;
}

/**
 * A double-sided tip: the reverse cap, the bar and the leading tip span the fill together. Below
 * the two caps' share only the sliver draws, and past it the caps draw with the bar between them.
 */
function doubleSided(tip: ViewTip, input: DoubleSidedInput): void {
  const { solved, bar, fill, lead, leftward, tips, cuts, hidden, fillBars, edge } = input;
  const reverse = tip.reverse.map((key) => solved.get(key)).find(sized)?.w ?? 0;
  const span = reverse + bar.w + lead;
  const threshold = (reverse + lead) / span;

  if (fill < threshold) {
    fillBars(0);
    for (const key of [...tip.elements, ...tip.reverse]) hidden.add(key);
    if (tip.sliver !== null && fill <= SLIVER_FLOOR) hidden.add(tip.sliver);
    return;
  }

  const barFill = ((fill - threshold) * span) / bar.w;
  fillBars(barFill);
  if (tip.sliver !== null) hidden.add(tip.sliver);
  for (const each of tips) cuts.set(each.key, outside(each.rect, edge(barFill), leftward, 1));
}

/** The fill the client treats as empty, below which a double-sided meter hides its sliver. */
const SLIVER_FLOOR = 1e-9;

/** `rect` cut to `fraction` of its width, kept from the side the fill starts at. */
function cutOf(rect: PixelRect, leftward: boolean, fraction: number): MeterCut {
  const crop: [number, number] = leftward ? [fraction, 1] : [1, fraction];
  return { rect: cropped(rect, crop), crop };
}

/** The client's crop of a rect: `x0' = (1-L)x1 + Lx0`, `x1' = (1-R)x0 + Rx1`. */
function cropped(rect: PixelRect, [left, right]: readonly [number, number]): PixelRect {
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const from = (1 - left) * x1 + left * x0;
  const to = (1 - right) * x0 + right * x1;
  return { x: from, y: rect.y, w: Math.max(0, to - from), h: rect.h };
}

/** A bar-extension tip: just outside the fill's edge, cut to `kept` from the edge's side. */
function outside(rect: PixelRect, edge: number, leftward: boolean, kept: number): MeterCut {
  const placed = { ...rect, x: leftward ? edge - rect.w : edge };
  return cutOf(placed, leftward, kept);
}

/** A glow tip: over the fill's edge, `glow` of its kept width behind it. */
function glowing(
  rect: PixelRect,
  edge: number,
  leftward: boolean,
  kept: number,
  glow: number,
): MeterCut {
  const crop: [number, number] = leftward ? [kept, 1] : [1, kept];
  const width = rect.w * kept;
  const from = edge - glow * rect.w * crop[0];
  return { rect: { x: from, y: rect.y, w: width, h: rect.h }, crop };
}

function sized(rect: PixelRect | undefined): rect is PixelRect {
  return rect !== undefined && rect.w > 0 && rect.h > 0;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Where the pointer plays a meter: the rect its bars span at full fill. */
export interface MeterHit {
  readonly meter: string;
  readonly rect: PixelRect;
  readonly leftward: boolean;
}

/** Every meter's hit rect, topmost first by scene layer, then layer, then file order. */
export function meterHits(tree: ViewTree, solved: ReadonlyMap<string, PixelRect>): MeterHit[] {
  const placed: { hit: MeterHit; sort: readonly [number, number, number] }[] = [];
  for (const element of tree.view.elements) {
    const meter = meterOf(element);
    if (meter === null || meter.direction > FILLS_LEFTWARD) continue;

    const rect = joined(meter.bars.flatMap((key) => solved.get(key) ?? []));
    if (rect === null) continue;

    const scene = sceneOf(tree, element.key);
    const sort = [
      scene === null ? 0 : (tree.scenes.get(scene)?.layer ?? 0),
      element.layer,
      tree.fileOrder.get(element.key) ?? 0,
    ] as const;
    placed.push({
      hit: { meter: element.key, rect, leftward: meter.direction === FILLS_LEFTWARD },
      sort,
    });
  }
  return placed
    .sort((a, b) => b.sort[0] - a.sort[0] || b.sort[1] - a.sort[1] || b.sort[2] - a.sort[2])
    .map(({ hit }) => hit);
}

/** The fill a pointer at screen `x` sets on `hit`. */
export function fillAt(hit: MeterHit, x: number): number {
  const along = (x - hit.rect.x) / hit.rect.w;
  return clamp01(hit.leftward ? 1 - along : along);
}

function joined(rects: readonly PixelRect[]): PixelRect | null {
  const shown = rects.filter(sized);
  if (shown.length === 0) return null;

  const x = Math.min(...shown.map((rect) => rect.x));
  const y = Math.min(...shown.map((rect) => rect.y));
  const right = Math.max(...shown.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...shown.map((rect) => rect.y + rect.h));
  return { x, y, w: right - x, h: bottom - y };
}
