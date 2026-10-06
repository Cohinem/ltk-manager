import { describe, expect, it } from "vitest";

import { allInView, viewBox } from "../minimapView";

describe("viewBox", () => {
  it("converts the viewport's translation and zoom to a rectangle in graph coordinates", () => {
    expect(viewBox([-100, 50, 2], 800, 600)).toEqual({ x: 50, y: -25, width: 400, height: 300 });
  });
});

describe("allInView", () => {
  const view = { x: 0, y: 0, width: 400, height: 300 };

  it("is true when every box is inside the view", () => {
    const boxes = [
      { x: 10, y: 10, width: 100, height: 50 },
      { x: 300, y: 250, width: 100, height: 50 },
    ];

    expect(allInView(boxes, view)).toBe(true);
  });

  it("is false when a box extends past any edge of the view", () => {
    const inside = { x: 10, y: 10, width: 100, height: 50 };

    expect(allInView([inside, { x: 350, y: 10, width: 100, height: 50 }], view)).toBe(false);
    expect(allInView([inside, { x: 10, y: 280, width: 100, height: 50 }], view)).toBe(false);
    expect(allInView([inside, { x: -20, y: 10, width: 100, height: 50 }], view)).toBe(false);
    expect(allInView([inside, { x: 10, y: -20, width: 100, height: 50 }], view)).toBe(false);
  });

  it("allows a box to extend one unit past the view", () => {
    expect(allInView([{ x: -1, y: -1, width: 402, height: 302 }], view)).toBe(true);
    expect(allInView([{ x: -2, y: 0, width: 100, height: 50 }], view)).toBe(false);
  });

  it("is true for no boxes", () => {
    expect(allInView([], view)).toBe(true);
  });
});
