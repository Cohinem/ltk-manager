import { describe, expect, it } from "vitest";

import type { MissileMovement, MissileSpec } from "@/lib/tauri";

import { FALLBACK_SPEED, flightOf } from "../missileSpec";

/** A spec whose missile moves by `movement`, every other field omitted unless `over` writes it. */
function specOf(movement: MissileMovement, over: Partial<MissileSpec> = {}): MissileSpec {
  return {
    movement,
    startDelay: null,
    startBone: null,
    targetBone: null,
    targetHeight: null,
    initialTargetHeight: null,
    heightOffsetAtEnd: null,
    height: null,
    facing: null,
    ...over,
  };
}

describe("flightOf", () => {
  it("returns the schema's defaults for every field that the spec omits", () => {
    expect(flightOf(specOf({ kind: "fixedSpeed", speed: 1200 }))).toEqual({
      movement: { kind: "fixedSpeed", speed: 1200 },
      height: null,
      facing: "none",
      endAtLaunchHeight: false,
      targetOffset: 0,
    });
  });

  it("returns FALLBACK_SPEED if the movement writes no speed or a speed of zero", () => {
    const fallback = { kind: "fixedSpeed", speed: FALLBACK_SPEED };

    expect(flightOf(specOf({ kind: "fixedSpeed", speed: null }))?.movement).toEqual(fallback);
    expect(flightOf(specOf({ kind: "fixedSpeed", speed: 0 }))?.movement).toEqual(fallback);
  });

  it("returns the schema's spline tangents if the spline omits them", () => {
    const flight = flightOf(specOf({ kind: "fixedSpeedSpline", speed: null, spline: null }));

    expect(flight?.movement).toEqual({
      kind: "fixedSpeedSpline",
      speed: FALLBACK_SPEED,
      spline: {
        startOffset: [0, 0, 0],
        control1: [-1, 0, 0],
        control2: [1, 0, 0],
        fromMissile: false,
      },
    });
  });

  it("returns the schema's drag, axis and maxSlope if the spec omits them", () => {
    const physics = specOf({ kind: "physics", initialSpeed: 500, drag: null, lifetime: 2 });
    const synced = specOf({ kind: "syncCircle", angularVelocity: 1, lifetime: null, axis: null });
    const terrain = specOf(
      { kind: "fixedSpeed", speed: 1000 },
      { height: { kind: "followTerrain", heightOffset: 50, maxSlope: null } },
    );

    expect(flightOf(physics)?.movement).toMatchObject({ kind: "physics", drag: 1 });
    expect(flightOf(synced)?.movement).toMatchObject({ kind: "syncCircle", axis: 1, lifetime: 0 });
    expect(flightOf(terrain)?.height).toEqual({
      kind: "followTerrain",
      heightOffset: 50,
      maxSlope: 10,
    });
  });

  it("returns null if the movement is unsupported or missing", () => {
    expect(flightOf(specOf({ kind: "unsupported", class_hash: "0x1" }))).toBeNull();
    expect(flightOf(specOf({ kind: "missing" }))).toBeNull();
  });

  it("drops an unsupported height solver and an unsupported facing", () => {
    const flight = flightOf(
      specOf(
        { kind: "fixedSpeed", speed: 1000 },
        {
          height: { kind: "unsupported", class_hash: "0x2" },
          facing: { kind: "unsupported", class_hash: "0x3" },
        },
      ),
    );

    expect(flight?.height).toBeNull();
    expect(flight?.facing).toBe("none");
  });

  it("adds targetHeight to the target offset only if the flight ends at the launch height", () => {
    const heights = { initialTargetHeight: 10, targetHeight: 30 };
    const movement: MissileMovement = { kind: "fixedSpeed", speed: 1000 };
    const atLaunch = specOf(movement, { ...heights, heightOffsetAtEnd: true });

    expect(flightOf(specOf(movement, heights))?.targetOffset).toBe(10);
    expect(flightOf(atLaunch)?.targetOffset).toBe(40);
  });
});
