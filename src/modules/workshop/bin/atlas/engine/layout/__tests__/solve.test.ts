import { describe, expect, it } from "vitest";

import { element, rect, scene, view } from "../../__tests__/fixtures";
import { buildTree } from "../../model/tree";
import type { ViewLayout, ViewLook } from "../../model/view";
import { arrange } from "../managed";
import { FULL_SAFE_ZONE, type LayoutSettings, type PixelRect, solve, solveRect } from "../solve";

const SCREEN: PixelRect = { x: 0, y: 0, w: 1920, h: 1080 };

function settings(width: number, height: number, hud = 1): LayoutSettings {
  return { screen: { width, height }, hud, safeZone: FULL_SAFE_ZONE };
}

describe("solveRect", () => {
  it("scales a size by the screen height over the source height on both axes", () => {
    const solved = solveRect(rect(0, 0, 160, 120), SCREEN, settings(1920, 1080));

    expect(solved).toEqual({ x: 0, y: 0, w: 144, h: 108 });
  });

  it("keeps an anchored point fixed and scales the rect about it", () => {
    const centred = rect(700, 500, 200, 200, { anchor: { kind: "single", anchor: [0.5, 0.5] } });

    const solved = solveRect(centred, SCREEN, settings(1920, 1080));

    expect(solved).toEqual({ x: 870, y: 450, w: 180, h: 180 });
  });

  it("places a right-anchored rect from the screen's right edge on a wider screen", () => {
    const right = rect(1500, 0, 100, 50, { anchor: { kind: "single", anchor: [1, 0] } });

    const solved = solveRect(right, SCREEN, settings(2560, 1080));

    expect(solved.x + solved.w).toBe(2560);
    expect(solved.w).toBe(90);
  });

  it("shrinks about the anchor under the HUD scale unless the rect ignores it", () => {
    const bottom = rect(700, 1100, 200, 100, { anchor: { kind: "single", anchor: [0.5, 1] } });
    const fixed = { ...bottom, ignoreGlobalScale: true };

    const scaled = solveRect(bottom, SCREEN, settings(1600, 1200, 0.66));
    const kept = solveRect(fixed, SCREEN, settings(1600, 1200, 0.66));

    expect(scaled.w).toBe(132);
    expect(scaled.y).toBe(1134);
    expect(scaled.y + scaled.h).toBe(1200);
    expect(kept).toEqual({ x: 700, y: 1100, w: 200, h: 100 });
  });

  it("stretches between two anchors of an AnchorDouble", () => {
    const stretched = rect(0, 0, 1600, 100, {
      anchor: { kind: "double", left: [0, 0], right: [1, 0] },
    });

    const solved = solveRect(stretched, SCREEN, settings(2560, 1080));

    expect(solved.x).toBe(0);
    expect(solved.x + solved.w).toBe(2560);
  });

  it("never draws below the source size under DisableResolutionDownscale", () => {
    const kept = rect(0, 0, 100, 100, { disableResolutionDownscale: true });

    const solved = solveRect(kept, SCREEN, settings(1280, 720));

    expect(solved.h).toBe(100);
  });

  it("insets an anchored rect into the safe zone", () => {
    const corner = rect(0, 0, 100, 100);
    const zoned: LayoutSettings = {
      ...settings(1600, 1200),
      safeZone: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
    };

    const solved = solveRect(corner, SCREEN, zoned);

    expect(solved.x).toBe(80);
    expect(solved.y).toBe(60);
    expect(solved.h).toBe(90);
  });

  it("puts a hierarchy rect's pivot on its aligned point of the parent", () => {
    const parent: PixelRect = { x: 100, y: 100, w: 400, h: 200 };
    const centred = rect(0, 0, 100, 50, {
      anchor: { kind: "hierarchy", align: [1, 2], pivot: [1, 2], margins: [ZERO, ZERO] },
    });

    const solved = solveRect(centred, parent, settings(1600, 1200));

    expect(solved).toEqual({ x: 250, y: 250, w: 100, h: 50 });
  });

  it("stretches a hierarchy axis between the parent's edges less its own margins", () => {
    const parent: PixelRect = { x: 100, y: 100, w: 400, h: 200 };
    const stretched = rect(0, 0, 10, 10, {
      anchor: {
        kind: "hierarchy",
        align: [3, 3],
        pivot: [0, 0],
        margins: [
          [-10, 20],
          [5, 0],
        ],
      },
    });

    const solved = solveRect(stretched, parent, settings(1600, 1200));

    expect(solved).toEqual({ x: 90, y: 105, w: 390, h: 195 });
  });
});

const ZERO: readonly [number, number] = [0, 0];
const ARC_FILL: ViewLook = {
  kind: "effect",
  effect: { effect: "arcFill" },
  sprite: null,
  flip: [false, false],
  perPixelUvsX: false,
};
const edges = (x: number, y: number, w: number, h: number) => ({
  x0: x,
  y0: y,
  x1: x + w,
  y1: y + h,
});

function style(overrides: Partial<ViewLayout>): ViewLayout {
  return {
    region: "region",
    kind: "verticalList",
    justify: [0, 0],
    fill: [0, 0],
    fillPriority: 0,
    cross: [0, 0],
    ignoreDisabled: false,
    ...overrides,
  };
}

describe("arrange", () => {
  it("stacks a vertical list's children from the region's left edge, centred down it", () => {
    const offsets = arrange(style({ justify: [0, 1] }), edges(10, 10, 60, 60), [
      { key: "a", rect: edges(300, 0, 20, 10) },
      { key: "b", rect: edges(500, 500, 30, 20) },
    ]);

    expect(offsets.get("a")).toEqual([-290, 25]);
    expect(offsets.get("b")).toEqual([-490, -465]);
  });

  it("shares a horizontal list's free space between its children", () => {
    const offsets = arrange(
      style({ kind: "horizontalList", justify: [4, 0] }),
      edges(0, 0, 100, 10),
      [
        { key: "a", rect: edges(0, 0, 20, 10) },
        { key: "b", rect: edges(0, 0, 20, 10) },
        { key: "c", rect: edges(0, 0, 20, 10) },
      ],
    );

    expect([...offsets.values()].map(([dx]) => dx)).toEqual([0, 40, 80]);
  });

  it("wraps a grid row at the region's far edge, and a child that fits exactly too", () => {
    const offsets = arrange(style({ kind: "grid" }), edges(0, 0, 50, 100), [
      { key: "a", rect: edges(0, 0, 20, 10) },
      { key: "b", rect: edges(0, 0, 20, 10) },
      { key: "c", rect: edges(0, 0, 10, 10) },
    ]);

    expect(offsets.get("a")).toEqual([0, 0]);
    expect(offsets.get("b")).toEqual([20, 0]);
    expect(offsets.get("c")).toEqual([0, 10]);
  });
});

describe("solve", () => {
  const at = (x: number, y: number, w: number, h: number) =>
    rect(x, y, w, h, { ignoreGlobalScale: true });
  const group = (children: string[], layout: ViewLayout | null = null): ViewLook => ({
    kind: "group",
    children,
    states: [],
    alpha: 1,
    layout,
    button: null,
    meter: null,
  });

  it("moves a managed layout's child group, and every element under it, into the region", () => {
    const tree = buildTree(
      view(
        [scene("s", 0)],
        [
          element("layout", "s", 0, group(["region", "row", "note"], style({})), null),
          element("region", "s", 0, { kind: "region" }, at(100, 100, 50, 50)),
          element("row", "s", 0, group(["icon"]), null),
          element("icon", "s", 0, { kind: "region" }, at(400, 400, 20, 20)),
          element("note", "s", 0, { kind: "region" }, at(900, 50, 30, 10)),
        ],
      ),
    );

    const solved = solve(tree, settings(1600, 1200));

    expect(solved.get("icon")).toEqual({ x: 100, y: 100, w: 20, h: 20 });
    expect(solved.get("row")).toEqual({ x: 100, y: 100, w: 20, h: 20 });
    expect(solved.get("note")).toEqual({ x: 100, y: 120, w: 30, h: 10 });
    expect(solved.get("layout")).toEqual({ x: 100, y: 100, w: 50, h: 50 });
  });

  it("leaves an effect at rest off out of a layout that ignores disabled elements", () => {
    const tree = buildTree(
      view(
        [scene("s", 0)],
        [
          element(
            "layout",
            "s",
            0,
            group(["region", "off", "on"], style({ ignoreDisabled: true })),
            null,
          ),
          element("region", "s", 0, { kind: "region" }, at(0, 0, 50, 50)),
          { ...element("off", "s", 0, ARC_FILL, at(300, 300, 10, 10)), enabled: false },
          element("on", "s", 0, { kind: "region" }, at(600, 600, 10, 10)),
        ],
      ),
    );

    expect(solve(tree, settings(1600, 1200)).get("on")).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});
