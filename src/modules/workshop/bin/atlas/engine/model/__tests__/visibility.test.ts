import { describe, expect, it } from "vitest";

import { element, icon, scene, view } from "../../__tests__/fixtures";
import { buildTree } from "../tree";
import type { ViewLook } from "../view";
import { hiddenScenesOf, restingHiddenScenes, restsHidden } from "../visibility";

const FLIPBOOK: ViewLook = {
  kind: "effect",
  effect: { effect: "animation", frames: 8, perRow: 4, fps: 10, finish: 0 },
  sprite: null,
  flip: [false, false],
  perPixelUvsX: false,
};

const GLOW: ViewLook = { ...FLIPBOOK, effect: { effect: "arcFill" } };

function enabled(key: string, layer: number) {
  return { ...scene(key, layer), enabled: true };
}

describe("restingHiddenScenes", () => {
  it("leaves off the scenes a view's file does not enable where it enables any", () => {
    const tree = buildTree(view([enabled("frame", 1), scene("selector", 2)], []));

    expect([...restingHiddenScenes(tree)]).toEqual(["selector"]);
  });

  it("shows every scene of a view whose file enables none", () => {
    const tree = buildTree(view([scene("a", 1), scene("b", 2)], []));

    expect(restingHiddenScenes(tree).size).toBe(0);
  });
});

describe("hiddenScenesOf", () => {
  it("flips the reader's scenes against the resting state, and shows all while disabled show", () => {
    const tree = buildTree(view([enabled("frame", 1), scene("selector", 2)], []));

    expect([...hiddenScenesOf(tree, new Set(["selector", "frame"]), false)]).toEqual(["frame"]);
    expect([...hiddenScenesOf(tree, new Set(), true)]).toEqual([]);
  });
});

describe("restsHidden", () => {
  it("rests an effect the file leaves off, a flipbook excepted, and nothing else", () => {
    expect(restsHidden({ ...element("fx", "a", 0, GLOW), enabled: false })).toBe(true);
    expect(restsHidden({ ...element("fx", "a", 0, GLOW), enabled: true })).toBe(false);
    expect(restsHidden({ ...element("fx", "a", 0, FLIPBOOK), enabled: false })).toBe(false);
    expect(restsHidden({ ...element("icon", "a", 0, icon()), enabled: false })).toBe(false);
  });
});
