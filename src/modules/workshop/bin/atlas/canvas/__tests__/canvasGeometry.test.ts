import { describe, expect, it } from "vitest";

import { clickedIn, elementsAt } from "../canvasGeometry";

const RECTS = new Map([
  ["frame", { x: 0, y: 0, w: 100, h: 100 }],
  ["icon", { x: 10, y: 10, w: 20, h: 20 }],
  ["overlay", { x: 10, y: 10, w: 20, h: 20 }],
  ["aside", { x: 60, y: 60, w: 20, h: 20 }],
]);

describe("elementsAt", () => {
  it("lists every element under the point, topmost first", () => {
    const order = ["frame", "icon", "overlay", "aside"];

    expect(elementsAt(order, RECTS, 15, 15)).toEqual(["overlay", "icon", "frame"]);
    expect(elementsAt(order, RECTS, 200, 200)).toEqual([]);
  });
});

describe("clickedIn", () => {
  const under = ["overlay", "icon", "frame"];

  it("picks the topmost on a first click, and the next one down on a repeat", () => {
    expect(clickedIn(under, null, false)).toBe("overlay");
    expect(clickedIn(under, "overlay", false)).toBe("overlay");
    expect(clickedIn(under, "overlay", true)).toBe("icon");
    expect(clickedIn(under, "icon", true)).toBe("frame");
  });

  it("wraps from the bottom back to the top, and picks nothing over nothing", () => {
    expect(clickedIn(under, "frame", true)).toBe("overlay");
    expect(clickedIn(under, "aside", true)).toBe("overlay");
    expect(clickedIn([], "overlay", true)).toBeNull();
  });
});
