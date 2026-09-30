import { describe, expect, it } from "vitest";

import { clickedIn, elementsAt, grabbedIn } from "../canvasGeometry";

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

describe("grabbedIn", () => {
  const rects = new Map([...RECTS, ["group", { x: 5, y: 5, w: 80, h: 80 }]]);
  const under = ["overlay", "icon", "frame"];

  it("grabs a selected element under the point before the topmost", () => {
    expect(grabbedIn(under, ["icon"], rects, 15, 15)).toBe("icon");
    expect(grabbedIn(under, [], rects, 15, 15)).toBe("overlay");
  });

  it("grabs a selected group around the point, which draws nothing of its own", () => {
    expect(grabbedIn(under, ["group"], rects, 15, 15)).toBe("group");
    expect(grabbedIn([], ["group"], rects, 90, 90)).toBeNull();
  });

  it("grabs the selection in a gap between its elements, as a selected scene's", () => {
    expect(grabbedIn([], ["icon", "aside"], rects, 45, 45)).toBe("aside");
    expect(grabbedIn([], ["icon", "aside"], rects, 95, 95)).toBeNull();
  });
});
