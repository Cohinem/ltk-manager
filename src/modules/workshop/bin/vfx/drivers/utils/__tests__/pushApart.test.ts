import { describe, expect, it } from "vitest";

import { type Box, pushedApart, pushedDown } from "../pushApart";

function box(id: string, x: number, y: number, width = 100, height = 50): Box {
  return { id, x, y, width, height };
}

function placeOf(boxes: readonly Box[], id: string): [number, number] {
  const found = boxes.find((each) => each.id === id)!;
  return [found.x, found.y];
}

const NONE: ReadonlySet<string> = new Set();

describe("pushedDown", () => {
  it("returns boxes that already have the gap between them unchanged", () => {
    const boxes = [box("a", 0, 0), box("b", 0, 70), box("c", 228, 10)];

    const out = pushedDown(boxes, 20);

    for (const each of boxes) expect(out.find((placed) => placed.id === each.id)).toBe(each);
  });

  it("moves a box down to the gap under a box above it that grew into it", () => {
    const out = pushedDown([box("a", 0, 0, 100, 200), box("b", 0, 70)], 20);

    expect(placeOf(out, "a")).toEqual([0, 0]);
    expect(placeOf(out, "b")).toEqual([0, 220]);
  });

  it("moves every box under the grown one, each to the gap under the one before it", () => {
    const out = pushedDown([box("a", 0, 0, 100, 200), box("b", 0, 70), box("c", 0, 140)], 20);

    expect(placeOf(out, "b")).toEqual([0, 220]);
    expect(placeOf(out, "c")).toEqual([0, 290]);
  });

  it("leaves a box of another column, which shares no width with the grown one", () => {
    const out = pushedDown([box("a", 0, 0, 100, 200), box("b", 228, 70)], 20);

    expect(placeOf(out, "b")).toEqual([228, 70]);
  });

  it("moves a box that shares only part of its width with the box above it", () => {
    const out = pushedDown([box("a", 0, 0), box("b", 60, 30)], 20);

    expect(placeOf(out, "b")).toEqual([60, 70]);
  });
});

describe("pushedApart", () => {
  it("returns boxes that already have the gap between them unchanged", () => {
    const boxes = [box("a", 0, 0), box("b", 220, 0), box("c", 0, 170)];

    const out = pushedApart(boxes, 120, NONE);

    for (const each of boxes) expect(out.find((placed) => placed.id === each.id)).toBe(each);
  });

  it("moves a box right where right is the shorter way past the box it is too close to", () => {
    const out = pushedApart([box("a", 0, 0, 300, 400), box("b", 220, 0)], 120, NONE);

    expect(placeOf(out, "a")).toEqual([0, 0]);
    expect(placeOf(out, "b")).toEqual([420, 0]);
  });

  it("moves a box down where down is the shorter way", () => {
    const out = pushedApart([box("a", 0, 0, 400, 100), box("b", 0, 170)], 120, NONE);

    expect(placeOf(out, "b")).toEqual([0, 220]);
  });

  it("keeps a box of the first set in place and moves the other, whatever their order", () => {
    const boxes = [box("upper", 0, 0, 400, 100), box("dragged", 0, 50)];

    const out = pushedApart(boxes, 120, new Set(["dragged"]));

    expect(placeOf(out, "dragged")).toEqual([0, 50]);
    expect(placeOf(out, "upper")).toEqual([0, 220]);
  });

  it("leaves no two boxes closer than the gap after a move puts a box beside a third", () => {
    const boxes = [box("a", 0, 0, 300, 300), box("b", 100, 100), box("c", 420, 0, 100, 400)];

    const out = pushedApart(boxes, 120, NONE);

    for (const left of out) {
      for (const right of out) {
        if (left.id >= right.id) continue;

        const apartX =
          right.x >= left.x + left.width + 120 || left.x >= right.x + right.width + 120;
        const apartY =
          right.y >= left.y + left.height + 120 || left.y >= right.y + right.height + 120;
        expect(apartX || apartY).toBe(true);
      }
    }
  });
});
