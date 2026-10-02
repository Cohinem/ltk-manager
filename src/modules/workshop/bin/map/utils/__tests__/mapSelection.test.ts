import { describe, expect, it } from "vitest";

import { inRect, modeOf, nearest, selectedBy } from "../mapSelection";

describe("selectedBy", () => {
  it("replaces, adds to, or flips the selection", () => {
    const held = new Set(["a", "b"]);

    expect([...selectedBy(held, ["c"], "replace")]).toEqual(["c"]);
    expect([...selectedBy(held, ["b", "c"], "add")]).toEqual(["a", "b", "c"]);
    expect([...selectedBy(held, ["b", "c"], "toggle")]).toEqual(["a", "c"]);
  });
});

describe("modeOf", () => {
  it("reads Shift as add and Ctrl or Cmd as a flip", () => {
    const keys = { shiftKey: false, ctrlKey: false, metaKey: false };

    expect(modeOf(keys)).toBe("replace");
    expect(modeOf({ ...keys, shiftKey: true })).toBe("add");
    expect(modeOf({ ...keys, metaKey: true, shiftKey: true })).toBe("toggle");
  });
});

describe("inRect and nearest", () => {
  const ids = ["a", "b", "c"];
  const points = [[10, 10], [50, 50], null] as const;

  it("keeps the points inside a box, never one behind the camera", () => {
    expect(inRect(ids, points, { left: 0, top: 0, right: 20, bottom: 20 })).toEqual(["a"]);
    expect(inRect(ids, points, { left: 0, top: 0, right: 100, bottom: 100 })).toEqual(["a", "b"]);
  });

  it("lands a click on the nearest point within reach", () => {
    expect(nearest(ids, points, [52, 47])).toBe("b");
    expect(nearest(ids, points, [30, 30])).toBeNull();
  });
});
