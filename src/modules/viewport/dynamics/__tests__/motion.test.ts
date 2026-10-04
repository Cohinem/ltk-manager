import { describe, expect, it } from "vitest";

import { passSeconds, STANDING, STILL_PASS_SECONDS } from "../motion";
import { createRoot } from "../world";
import { type LegChoice, motion, rounded } from "./fixtures";

describe("STANDING", () => {
  it("stands where it is, and puts back a root something moved", () => {
    const root = createRoot(2);
    root.position.set([4, 5, 6]);
    root.rotation.set([0, 1, 0, 0]);

    STANDING.rootInto(5, root);

    expect(rounded([...root.position, ...root.rotation])).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(root.scale).toBe(2);
  });
});

describe("passSeconds", () => {
  it("answers a pose's own duration, and a pass of its own for a pose of none", () => {
    expect(passSeconds(1.5)).toBe(1.5);
    expect(passSeconds(0)).toBe(STILL_PASS_SECONDS);
  });
});

describe("the motions of the fixtures", () => {
  const at = (choice: Partial<LegChoice>, time: number, period = 2) => {
    const root = motion(choice, period).rootInto(time, createRoot());
    return rounded([...root.position, ...root.rotation]);
  };

  it("stands where it is", () => {
    expect(at({ kind: "stand" }, 5)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("runs forward along `+z` without end", () => {
    expect(at({ kind: "run", speed: 100 }, 0.5)).toEqual([0, 0, 50, 0, 0, 0, 1]);
    expect(at({ kind: "run", speed: 100 }, 7)).toEqual([0, 0, 700, 0, 0, 0, 1]);
  });

  it("runs half of each pass and stands the other half", () => {
    expect(at({ kind: "runAndStop", speed: 100 }, 1.5)).toEqual([0, 0, 100, 0, 0, 0, 1]);
    expect(at({ kind: "runAndStop", speed: 100 }, 2.5)).toEqual([0, 0, 150, 0, 0, 0, 1]);
  });

  it("turns in place about the up axis", () => {
    const quarter = Math.SQRT1_2;
    expect(at({ kind: "turn", turnRate: 90 }, 1)).toEqual(
      rounded([0, 0, 0, 0, quarter, 0, quarter]),
    );
  });

  it("turns a quarter in the middle of a pass and runs on along the new facing", () => {
    const [x, , z, , y, , w] = at({ kind: "strafeTurn", speed: 100 }, 2);

    expect([y, w]).toEqual(rounded([Math.SQRT1_2, Math.SQRT1_2]));
    expect(x).toBeGreaterThan(80);
    expect(z).toBeGreaterThan(80);
  });

  it("runs a circle at a custom speed and turn rate, and stops where it is told", () => {
    /* A quarter turn a second at a speed of the arc's length puts the unit a radius out. */
    const radius = 100 / (Math.PI / 2);
    expect(at({ kind: "custom", speed: 100, turnRate: 90 }, 1).slice(0, 3)).toEqual(
      rounded([radius, 0, radius]),
    );
    expect(at({ kind: "custom", speed: 100, turnRate: 0, stopAt: 0.5 }, 1.5)).toEqual([
      0, 0, 50, 0, 0, 0, 1,
    ]);
  });

  it("starts each pass where the last one ended, turned by what it turned", () => {
    /* Two passes of a quarter turn each face the unit back the way it came. */
    const [x, , z] = at({ kind: "custom", speed: 100, turnRate: 90 }, 2, 1);
    const radius = 100 / (Math.PI / 2);

    expect(rounded([x, z])).toEqual(rounded([2 * radius, 0]));
  });
});
