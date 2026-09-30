import { describe, expect, it } from "vitest";

import type { PropertyEdit } from "@/lib/tauri";

import { element, icon, rect, scene, view } from "../../__tests__/fixtures";
import { type LayoutSettings, type PixelRect, solveRect } from "../../layout/solve";
import { buildTree } from "../../model/tree";
import type { ViewLayout, ViewLook, ViewRect } from "../../model/view";
import { anchorEdit, rectEdit } from "../elementEdits";
import { type EdgeDelta, moveDelta, rectFields, retarget } from "../rectEdit";
import { snapRect } from "../snap";
import { layerEdits, moveSet, sceneMoveEdits, siblingsOf } from "../targets";

const PARENT: PixelRect = { x: 200, y: 100, w: 800, h: 600 };

function settings(width: number, height: number, hud = 1): LayoutSettings {
  return { screen: { width, height }, hud, safeZone: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 } };
}

function withFields(before: ViewRect, fields: ReturnType<typeof retarget>): ViewRect {
  const anchor =
    before.anchor.kind === "hierarchy" && fields.margins !== null
      ? { ...before.anchor, margins: fields.margins }
      : before.anchor;
  return { ...before, position: fields.position, size: fields.size, anchor };
}

function edgesOf(rect: PixelRect) {
  return { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
}

const unsnapped = { disablePixelSnapping: [true, true] as [boolean, boolean] };

describe("retarget", () => {
  const cases: [string, ViewRect][] = [
    ["a corner anchor", rect(300, 200, 120, 80, unsnapped)],
    [
      "a centre anchor",
      rect(700, 500, 200, 100, { ...unsnapped, anchor: { kind: "single", anchor: [0.5, 0.5] } }),
    ],
    [
      "a double anchor",
      rect(100, 900, 400, 60, {
        ...unsnapped,
        anchor: { kind: "double", left: [0, 1], right: [1, 1] },
      }),
    ],
    [
      "a pivoted hierarchy anchor",
      rect(10, 20, 150, 90, {
        ...unsnapped,
        anchor: {
          kind: "hierarchy",
          align: [1, 2],
          pivot: [1, 2],
          margins: [
            [0, 0],
            [0, 0],
          ],
        },
      }),
    ],
    [
      "a stretched hierarchy anchor",
      rect(0, 30, 0, 90, {
        ...unsnapped,
        anchor: {
          kind: "hierarchy",
          align: [3, 0],
          pivot: [0, 0],
          margins: [
            [12, 8],
            [0, 0],
          ],
        },
      }),
    ],
  ];
  const deltas: [string, EdgeDelta][] = [
    ["a move", moveDelta(37, -21)],
    ["a resize from the far corner", { x0: 0, y0: 0, x1: 44, y1: 18 }],
    ["a resize from the near corner", { x0: -30, y0: 12, x1: 0, y1: 0 }],
  ];

  for (const [anchorName, before] of cases) {
    for (const [deltaName, delta] of deltas) {
      for (const at of [settings(1920, 1080), settings(2560, 1080, 0.8)]) {
        it(`moves the edges of ${anchorName} by ${deltaName} at ${at.screen.width} and HUD ${at.hud}`, () => {
          const from = edgesOf(solveRect(before, PARENT, at));

          const after = withFields(before, retarget(before, at, delta, false));
          const to = edgesOf(solveRect(after, PARENT, at));

          expect(to.x0 - from.x0).toBeCloseTo(delta.x0, 3);
          expect(to.x1 - from.x1).toBeCloseTo(delta.x1, 3);
          expect(to.y0 - from.y0).toBeCloseTo(delta.y0, 3);
          expect(to.y1 - from.y1).toBeCloseTo(delta.y1, 3);
        });
      }
    }
  }

  it("rounds what changed to whole source pixels when it snaps", () => {
    const fields = retarget(rect(10, 10, 100, 100), settings(1920, 1080), moveDelta(3, 0), true);

    expect(fields.position.every(Number.isInteger)).toBe(true);
    expect(fields.size).toEqual([100, 100]);
  });
});

describe("rectEdit", () => {
  it("writes only the leaves that changed, creating the rect's fields on the way", () => {
    const before = rectFields(rect(10, 20, 30, 40));
    const edit = rectEdit("0x00000abc", before, { ...before, position: [15, 20] });

    expect(edit?.entry).toBe("0x00000abc");
    expect(edit?.edits.filter((each) => each.type === "setLeaf")).toEqual([
      expect.objectContaining({ value: { type: "vector", values: [15, 20] } }),
    ]);
    expect(edit?.edits[0]).toEqual(expect.objectContaining({ type: "ensureProperty", path: "" }));
  });

  it("writes nothing for fields that did not change", () => {
    const fields = rectFields(rect(10, 20, 30, 40));

    expect(rectEdit("0x00000abc", fields, fields)).toBeNull();
  });

  it("re-anchors through the anchors pointer and writes the position that keeps the rect in place", () => {
    const edit = anchorEdit("0x00000abc", { kind: "single", anchor: [1, 0] }, [5, 6], [7, 8]);

    expect(edit.edits).toContainEqual(
      expect.objectContaining({ type: "replacePointer", class: "AnchorSingle" }),
    );
    expect(edit.edits).toContainEqual(
      expect.objectContaining({ type: "setLeaf", value: { type: "vector", values: [5, 6] } }),
    );
  });
});

describe("snapRect", () => {
  const target: PixelRect = { x: 100, y: 100, w: 200, h: 50 };

  it("lands the nearest line within the threshold on a target's edge and draws its guide", () => {
    const snapped = snapRect({ x: 297, y: 400, w: 40, h: 40 }, [target], 5);

    expect(snapped.offset).toEqual([3, 0]);
    expect(snapped.guides).toContainEqual({ axis: 0, at: 300, from: 100, to: 440 });
  });

  it("leaves a rect that no line brings within the threshold where it is", () => {
    expect(snapRect({ x: 500, y: 500, w: 10, h: 10 }, [target], 5).offset).toEqual([0, 0]);
  });

  it("snaps centres to centres", () => {
    const snapped = snapRect({ x: 180, y: 300, w: 42, h: 10 }, [target], 4);

    expect(snapped.offset[0]).toBe(-1);
  });
});

describe("the targets of an edit", () => {
  const group = (children: string[], layout: ViewLayout | null = null): ViewLook => ({
    kind: "group",
    children,
    states: [],
    alpha: 1,
    layout,
    button: null,
    meter: null,
  });
  const hierarchy = rect(0, 0, 10, 10, {
    anchor: {
      kind: "hierarchy",
      align: [0, 0],
      pivot: [0, 0],
      margins: [
        [0, 0],
        [0, 0],
      ],
    },
  });
  const layout: ViewLayout = {
    region: "region",
    kind: "horizontalList",
    justify: [0, 0],
    fill: [0, 0],
    fillPriority: 0,
    cross: [0, 0],
    ignoreDisabled: false,
  };
  const tree = buildTree(
    view(
      [scene("s", 0), scene("t", 1)],
      [
        element("panel", "s", 2, group(["frame", "free"]), null),
        element("frame", "s", 0, group(["pinned"])),
        element("pinned", "s", 0, icon(), hierarchy),
        element("free", "s", 1, icon()),
        element("list", "s", 0, group(["region", "item"], layout)),
        element("region", "s", 0, { kind: "region" }),
        element("item", "s", 0, icon()),
        element("low", "s", 0, icon()),
        element("high", "s", 5, icon()),
      ],
    ),
  );

  it("moves a group with everything under it, less what a hierarchy anchor carries", () => {
    const moved = moveSet(tree, ["panel"]);

    expect([...moved.moving].sort()).toEqual(["frame", "free", "panel", "pinned"]);
    expect([...moved.written].sort()).toEqual(["frame", "free"]);
  });

  it("leaves a child a managed layout places alone unless its layout moves", () => {
    expect(moveSet(tree, ["item"]).written).toEqual([]);
    expect(moveSet(tree, ["list"]).written).toEqual(["list", "region"]);
  });

  it("orders siblings by layer and then by file order", () => {
    expect(siblingsOf(tree, "low")).toEqual(["list", "low", "panel", "high"]);
  });

  it("swaps layers with the sibling above, and goes past the top by one", () => {
    const layer = (edit: PropertyEdit) => {
      const first = edit.edits[0];
      return first?.type === "setLeaf" ? first.value : undefined;
    };

    expect(layerEdits(tree, "low", "forward").map((edit) => [edit.entry, layer(edit)])).toEqual([
      ["low", { type: "integer", text: "2" }],
      ["panel", { type: "integer", text: "0" }],
    ]);
    expect(layerEdits(tree, "low", "front").map(layer)).toEqual([{ type: "integer", text: "6" }]);
    expect(layerEdits(tree, "high", "front")).toEqual([]);
  });

  it("raises every other sibling to send an element on layer 0 to the back", () => {
    const edits = layerEdits(tree, "low", "back");

    expect(edits.map((edit) => edit.entry)).toEqual(["low", "list", "panel", "high"]);
  });

  it("takes an element out of its group when it moves to another scene", () => {
    const edits = sceneMoveEdits(tree, "free", "t");

    expect(edits.map((edit) => edit.entry)).toEqual(["free", "panel"]);
    expect(edits[1]?.edits).toEqual([{ type: "removeItem", path: "[1]" }]);
  });
});
