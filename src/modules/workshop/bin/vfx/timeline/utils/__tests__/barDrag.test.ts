import { describe, expect, it } from "vitest";

import { barFields, barGripAt, draggedBar, snapTime } from "../barDrag";

const view = { from: 0, to: 10 };
const bar = { start: 1, end: 3, tail: 1, linger: 1, period: null, burst: false };

describe("a bar's grips", () => {
  it("grips the nearest edge, moves between them, and takes nothing off the bar", () => {
    expect(barGripAt(bar, view, 100, 10, true)).toBe("start");
    expect(barGripAt(bar, view, 100, 31, true)).toBe("end");
    expect(barGripAt(bar, view, 100, 50, true)).toBe("linger");
    expect(barGripAt(bar, view, 100, 20, true)).toBe("move");
    expect(barGripAt(bar, view, 100, 50, false)).toBeNull();
    expect(barGripAt(bar, view, 100, 80, true)).toBeNull();
  });

  it("keeps the end on a burst and on a bar too short to tell its edges apart", () => {
    expect(barGripAt({ ...bar, burst: true }, view, 100, 30, true)).toBe("end");
    expect(barGripAt({ ...bar, end: 1.02 }, view, 100, 10.2, false)).toBe("end");
  });

  it("grips an endless bar's end at the view's edge", () => {
    expect(barGripAt({ ...bar, end: null }, view, 100, 99, true)).toBe("end");
  });
});

describe("a dragged bar", () => {
  it("moves whole, or trims its start alone keeping its end", () => {
    expect(draggedBar("move", bar, 2)).toMatchObject({ start: 2, end: 4 });
    expect(draggedBar("start", bar, 2)).toMatchObject({ start: 2, end: 3 });
    expect(draggedBar("start", bar, 5).start).toBeLessThan(3);
  });

  it("writes the start and the lifetime of a trim together", () => {
    expect(barFields("start", draggedBar("start", bar, 2))).toEqual([
      { field: "timeBeforeFirstEmission", value: 2 },
      { field: "lifetime", value: 1 },
    ]);
    expect(barFields("end", draggedBar("end", bar, 4))).toEqual([{ field: "lifetime", value: 3 }]);
    expect(barFields("linger", draggedBar("linger", bar, 3))).toEqual([
      { field: "particleLinger", value: 0 },
    ]);
  });
});

describe("snapping", () => {
  it("pulls a time onto a target within reach, and rounds it otherwise", () => {
    expect(snapTime(2.04, [2], view, 100, 0.01)).toEqual({ time: 2, snapped: 2 });
    const free = snapTime(2.444, [5], view, 100, 0.01);
    expect(free.time).toBeCloseTo(2.44, 9);
    expect(free.snapped).toBeNull();
  });
});
