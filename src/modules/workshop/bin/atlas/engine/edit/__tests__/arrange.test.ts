import { describe, expect, it } from "vitest";

import type { PropertyEdit } from "@/lib/tauri";

import { element, icon, rect, scene, view } from "../../__tests__/fixtures";
import {
  FULL_SAFE_ZONE,
  type LayoutSettings,
  type PixelRect,
  solve,
  solveRect,
} from "../../layout/solve";
import { buildTree } from "../../model/tree";
import type { ViewElement, ViewRect } from "../../model/view";
import { alignEdits, distributeEdits, nudgeEdits, reanchorEdit } from "../arrange";

const SETTINGS: LayoutSettings = {
  screen: { width: 1920, height: 1080 },
  hud: 0.9,
  safeZone: FULL_SAFE_ZONE,
};
const SCREEN: PixelRect = { x: 0, y: 0, w: 1920, h: 1080 };

/** The vector each edit sets under `Position.UIRect.Position`, by element. */
function positions(edits: readonly PropertyEdit[]): Record<string, readonly (number | null)[]> {
  const held: Record<string, readonly (number | null)[]> = {};
  for (const edit of edits) {
    for (const each of edit.edits) {
      if (each.type === "setLeaf" && each.value.type === "vector") {
        held[edit.entry] ??= each.value.values;
      }
    }
  }
  return held;
}

describe("reanchorEdit", () => {
  const anchored = (anchor: ViewRect["anchor"]) => rect(700, 400, 200, 100, { anchor });
  const tree = (at: ViewRect) =>
    buildTree(view([scene("s", 0)], [element("a", "s", 0, icon(), at)]));

  for (const [name, from] of [
    ["a corner anchor", anchored({ kind: "single", anchor: [0, 0] })],
    ["a double anchor", anchored({ kind: "double", left: [0, 0], right: [1, 1] })],
  ] as const) {
    it(`keeps ${name} where it is when it moves to the bottom right corner`, () => {
      const before = solveRect(from, SCREEN, SETTINGS);

      const edit = reanchorEdit(
        tree(from),
        SETTINGS,
        "a",
        { kind: "single", anchor: [1, 1] },
        SCREEN,
      );
      const leaves = edit?.edits.flatMap((each) =>
        each.type === "setLeaf" && each.value.type === "vector" ? [each.value.values] : [],
      );
      const [anchor, position, size] = leaves ?? [];
      const after = solveRect(
        {
          ...from,
          anchor: { kind: "single", anchor: [anchor?.[0] ?? 0, anchor?.[1] ?? 0] },
          position: [position?.[0] ?? 0, position?.[1] ?? 0],
          size: [size?.[0] ?? 0, size?.[1] ?? 0],
        },
        SCREEN,
        SETTINGS,
      );

      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.w - before.w)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.h - before.h)).toBeLessThanOrEqual(1);
    });
  }
});

describe("arranging a selection", () => {
  const free = { ignoreGlobalScale: true };
  const elements: ViewElement[] = [
    element("a", "s", 0, icon(), rect(100, 100, 100, 50, free)),
    element("b", "s", 0, icon(), rect(400, 300, 50, 50, free)),
    element("c", "s", 0, icon(), rect(1000, 200, 100, 100, free)),
  ];
  const tree = buildTree(view([scene("s", 0)], elements));
  const solved = solve(tree, { ...SETTINGS, screen: { width: 1600, height: 1200 } });
  const settings = { ...SETTINGS, screen: { width: 1600, height: 1200 } };

  it("lines the selection up on its leftmost edge", () => {
    const moved = positions(alignEdits(tree, settings, solved, ["a", "b", "c"], "left"));

    expect(moved).toEqual({ b: [100, 300], c: [100, 200] });
  });

  it("centres the selection on its union's middle", () => {
    const moved = positions(alignEdits(tree, settings, solved, ["a", "b"], "middle"));

    expect(moved).toEqual({ a: [100, 200], b: [400, 200] });
  });

  it("spaces three elements evenly between the outermost two", () => {
    const moved = positions(distributeEdits(tree, settings, solved, ["a", "b", "c"], 0));

    expect(moved).toEqual({ b: [575, 300] });
  });

  it("nudges each element by one of its own source pixels", () => {
    expect(positions(nudgeEdits(tree, settings, ["a", "c"], [1, 0]))).toEqual({
      a: [101, 100],
      c: [1001, 200],
    });
  });
});
