import { describe, expect, it } from "vitest";

import type { PixelRect } from "../layout/solve";
import { disabledMeters, meterDraws, meterFills, type ViewMeter } from "../model/meters";
import { buildTree } from "../model/tree";
import type { ViewLook } from "../model/view";
import { element, icon, scene, view } from "./fixtures";

const METER: ViewMeter = { bars: ["bar"], direction: 0, start: 0, enabled: true, tip: null };

function meterLook(meter: ViewMeter): ViewLook {
  const tip = meter.tip === null ? [] : [...meter.tip.elements, ...meter.tip.reverse];
  return {
    kind: "group",
    children: [...meter.bars, ...tip],
    states: [],
    alpha: 1,
    layout: null,
    button: null,
    meter,
  };
}

function treeOf(meter: ViewMeter) {
  return buildTree(
    view(
      [scene("s", 0)],
      [element("meter", "s", 0, meterLook(meter)), element("bar", "s", 1, icon())],
    ),
  );
}

const box = (x: number, w: number): PixelRect => ({ x, y: 0, w, h: 10 });

function drawsAt(meter: ViewMeter, fill: number, rects: Record<string, PixelRect>) {
  const solved = new Map(Object.entries({ bar: box(0, 100), ...rects }));
  return meterDraws(treeOf(meter), solved, new Map([["meter", fill]]));
}

function tipped(style: NonNullable<ViewMeter["tip"]>["style"], glow = 0.5): ViewMeter {
  return {
    ...METER,
    tip: { style, elements: ["tip"], reverse: ["cap"], sliver: "sliver", glow },
  };
}

describe("meterDraws", () => {
  it("cuts a bar from the edge its direction keeps", () => {
    expect(drawsAt(METER, 0.25, {}).cuts.get("bar")).toEqual({ rect: box(0, 25), crop: [1, 0.25] });
    expect(drawsAt({ ...METER, direction: 1 }, 0.25, {}).cuts.get("bar")).toEqual({
      rect: box(75, 25),
      crop: [0.25, 1],
    });
    expect(drawsAt({ ...METER, direction: 2 }, 0.25, {}).cuts.size).toBe(0);
  });

  it("extends a bar by its tip, and cuts the tip where the fill is narrower than it", () => {
    const meter = tipped("barExtension");
    const full = drawsAt(meter, 0.5, { tip: box(200, 10) });
    expect(full.cuts.get("bar")?.rect.w).toBeCloseTo(40);
    expect(full.cuts.get("tip")?.rect).toEqual(box(40, 10));

    const short = drawsAt(meter, 0.05, { tip: box(200, 10) });
    expect(short.cuts.get("bar")?.rect.w).toBe(0);
    expect(short.cuts.get("tip")?.rect.x).toBe(0);
    expect(short.cuts.get("tip")?.rect.w).toBeCloseTo(5);
  });

  it("centres a glow tip over the fill's edge by its share", () => {
    const draws = drawsAt(tipped("glowCenteredOverlay", 0.85), 0.5, { tip: box(200, 10) });

    expect(draws.cuts.get("bar")?.rect).toEqual(box(0, 50));
    expect(draws.cuts.get("tip")?.rect.x).toBeCloseTo(41.5);
  });

  it("draws a double-sided meter's sliver alone below its caps' share", () => {
    const rects = { tip: box(200, 10), cap: box(-10, 10), sliver: box(-10, 2) };
    const meter = tipped("doubleSided");

    const low = drawsAt(meter, 0.1, rects);
    expect([...low.hidden].sort()).toEqual(["cap", "tip"]);
    expect(low.cuts.get("bar")?.rect.w).toBe(0);
    expect(drawsAt(meter, 0, rects).hidden.has("sliver")).toBe(true);

    const full = drawsAt(meter, 1, rects);
    expect([...full.hidden]).toEqual(["sliver"]);
    expect(full.cuts.get("bar")?.rect.w).toBeCloseTo(100);
    expect(full.cuts.get("tip")?.rect.x).toBeCloseTo(100);
  });
});

describe("meterFills", () => {
  it("fills a meter to the reader's own, else the live input while samples draw, else its start", () => {
    const tree = treeOf({ ...METER, start: 0.3 });

    expect(meterFills(tree, { own: {}, samples: false, live: 0.7 }).get("meter")).toBe(0.3);
    expect(meterFills(tree, { own: {}, samples: true, live: 0.7 }).get("meter")).toBe(0.7);
    expect(meterFills(tree, { own: { meter: 2 }, samples: true, live: 0.7 }).get("meter")).toBe(1);
  });

  it("names the meters the file leaves off", () => {
    expect(disabledMeters(treeOf({ ...METER, enabled: false }))).toEqual(new Set(["meter"]));
    expect(disabledMeters(treeOf(METER)).size).toBe(0);
  });
});
