import { describe, expect, it } from "vitest";

import { FORWARD } from "@/modules/viewport";

import type { MissileFlight } from "../missile";
import {
  aimedAt,
  type Anchor,
  carrierOf,
  CONTINUOUS_RUN,
  facingAt,
  FIRST_FLIGHT,
  FLIGHT_HEIGHT,
  fliesAsMissile,
  GROUND_RIG,
  landed,
  missileMotion,
  type Motion,
  originAt,
  phaseAt,
  playbackOf,
  retargetable,
  retargeted,
  runLength,
  runSpan,
  targetAt,
  withCarrier,
  withPlayback,
} from "../rig";

/** A level, straight flight at `speed` units a second. */
function level(speed: number): MissileFlight {
  return { ...FIRST_FLIGHT, movement: { kind: "fixedSpeed", speed } };
}

/** A flight that circles its centre once every `period` seconds, for `lifetime` or forever at 0. */
function circling(period: number, lifetime = 0): MissileFlight {
  return {
    ...FIRST_FLIGHT,
    movement: {
      kind: "circle",
      angularVelocity: (Math.PI * 2) / period,
      linearVelocity: 0,
      radialVelocity: 0,
      lifetime,
    },
  };
}

/** A missile a hundred units long at ten units a second, so a second is a tenth of it. */
const SLOW: Motion = { kind: "missile", from: [0, 0, 0], to: [100, 0, 0], flight: level(10) };

/** A missile that circles the origin ten units out, once every four seconds. */
const CIRCLE: Motion = missileMotion(circling(4), 10);

/** An anchor walking ten units a second along `x`, turned a quarter about up. */
const WALKER: Anchor = {
  originAt: (time) => [time * 10, 5, 0],
  basisInto: (_time, out) => {
    out.set([0, 0, 1, 0, 1, 0, -1, 0, 0]);
    return out;
  },
};

const BONE: Motion = { kind: "bone", anchor: WALKER, target: null };

function rounded(point: readonly number[]): number[] {
  return point.map((value) => Math.round(value * 1e6) / 1e6 + 0);
}

/** Asserts that each axis of `point` matches `expected` to `digits` decimals, for a sampled track. */
function expectNear(point: readonly number[], expected: readonly number[], digits = 1) {
  expected.forEach((value, axis) => expect(point[axis]).toBeCloseTo(value, digits));
}

describe("facingAt", () => {
  it("returns FORWARD for a still rig", () => {
    expect(facingAt({ kind: "still" }, 3)).toEqual(FORWARD);
  });

  it("returns a missile's travel laid flat and unit long", () => {
    const descent: Motion = {
      kind: "missile",
      from: [0, 0, 0],
      to: [30, 0, 40],
      flight: { ...level(10), endAtLaunchHeight: false },
    };

    expectNear(facingAt(descent, 0, 50), [0.6, 0, 0.8], 5);
    expectNear(facingAt(SLOW, 9), [1, 0, 0], 5);
  });

  it("returns FORWARD if the missile's target stands on its launch point", () => {
    expectNear(facingAt({ ...SLOW, to: [0, 0, 0] }, 0), FORWARD, 5);
  });

  it("returns a circling missile's tangent", () => {
    expectNear(facingAt(CIRCLE, 0), [0, 0, 1]);
    expectNear(facingAt(CIRCLE, 1), [-1, 0, 0]);
  });

  it("faces a bone along its joint's own +Z, laid flat", () => {
    expect(rounded(facingAt(BONE, 0))).toEqual([1, 0, 0]);
  });
});

describe("a bone", () => {
  it("stands where its anchor does at the run's time, lifted by the rig's height", () => {
    expect(originAt(BONE, 2)).toEqual([20, 5, 0]);
    expect(originAt(BONE, 2, 3)).toEqual([20, 8, 0]);
  });

  it("aims at its target anchor", () => {
    const target: Anchor = { ...WALKER, originAt: () => [0, 0, 50] };

    expect(targetAt({ ...BONE, target }, 1)).toEqual([0, 0, 50]);
  });

  it("returns a point along the anchor's facing if the bone has no target", () => {
    const turned: Anchor = {
      ...WALKER,
      basisInto: (_time, out) => {
        out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        return out;
      },
    };
    const [x, y, z] = targetAt({ ...BONE, anchor: turned }, 1);

    expect([x, y]).toEqual([10, 5]);
    expect(z).toBeGreaterThan(0);
  });

  it("runs for the system's own span, as a still rig does", () => {
    expect(runLength(BONE, 4.5)).toBe(4.5);
    expect(landed(BONE, 1000)).toBe(false);
  });
});

describe("targetAt", () => {
  it("returns a missile's target at the launch height if the flight ends at it", () => {
    expect(targetAt(SLOW, 0, 30)).toEqual([100, 30, 0]);
    expect(targetAt(SLOW, 5, 30)).toEqual([100, 30, 0]);
  });

  it("returns a missile's target at targetOffset if the flight ends on the ground", () => {
    const grounded: Motion = {
      ...SLOW,
      flight: { ...level(10), endAtLaunchHeight: false, targetOffset: 20 },
    };

    expect(targetAt(grounded, 0, 30)).toEqual([100, 20, 0]);
  });

  it("returns the centre a circling missile turns about", () => {
    expect(targetAt(CIRCLE, 0.3)).toEqual([0, 0, 0]);
  });

  it("returns a facing toward the still rig's target", () => {
    expect(rounded(facingAt({ kind: "still", target: [30, 9, 40] }, 0))).toEqual([0.6, 0, 0.8]);
  });

  it("returns the still rig's target lifted by the rig height if the rig has one", () => {
    expect(targetAt({ kind: "still", target: [1, 2, 3] }, 0, 5)).toEqual([1, 7, 3]);
  });

  it("returns a point along FORWARD for a still rig", () => {
    const [x, y, z] = targetAt({ kind: "still" }, 0);

    expect(z).toBeGreaterThan(0);
    expect([x, y]).toEqual([0, 0]);
    expect(facingAt({ kind: "still" }, 0)).toEqual(FORWARD);
  });
});

describe("originAt", () => {
  it("leaves a still rig at the world origin", () => {
    expect(originAt({ kind: "still" }, 0)).toEqual([0, 0, 0]);
    expect(originAt({ kind: "still" }, 99)).toEqual([0, 0, 0]);
  });

  it("moves a straight missile at its own speed", () => {
    expect(originAt(SLOW, 0)).toEqual([0, 0, 0]);
    expectNear(originAt(SLOW, 2.5), [25, 0, 0]);
    expectNear(originAt(SLOW, 10), [100, 0, 0]);
  });

  it("holds a missile at its target rather than overshooting it", () => {
    expect(originAt(SLOW, 500)).toEqual([100, 0, 0]);
  });

  it("holds a missile at its launch point before the run began", () => {
    expect(originAt(SLOW, -10)).toEqual([0, 0, 0]);
  });

  it("launches a missile at the rig height and adds no height after launch", () => {
    expect(originAt(SLOW, 0, 30)).toEqual([0, 30, 0]);
    expectNear(originAt(SLOW, 5, 30), [50, 30, 0]);
    expect(originAt(SLOW, 500, 30)).toEqual([100, 30, 0]);
  });

  it("moves a circling missile in the ground plane, once per period", () => {
    expect(originAt(CIRCLE, 0)).toEqual([10, 0, 0]);
    expectNear(originAt(CIRCLE, 1), [0, 0, 10], 3);
    expectNear(originAt(CIRCLE, 4), [10, 0, 0], 3);
  });
});

describe("missileMotion", () => {
  it("centres a straight flight on the origin along X, so the whole run is on screen", () => {
    expect(missileMotion(level(400), 200)).toMatchObject({
      kind: "missile",
      from: [-100, 0, 0],
      to: [100, 0, 0],
    });
  });

  it("lays the flight on the ground plane, which the rig's height lifts at launch", () => {
    const motion = missileMotion(level(400), 200);

    expect(originAt(motion, 0, FLIGHT_HEIGHT)).toEqual([-100, FLIGHT_HEIGHT, 0]);
  });

  it("returns a circle that starts the distance out along X and turns about the origin", () => {
    expect(CIRCLE).toMatchObject({ from: [10, 0, 0], to: [0, 0, 0] });
  });
});

describe("runLength", () => {
  it("ends a missile on arrival, plus the linger its particles play out for", () => {
    expect(runLength(SLOW, 30)).toBeCloseTo(10, 1);
    expect(runLength(SLOW, 30, 2.5)).toBeCloseTo(12.5, 1);
  });

  it("is the scrub's whole window, one flight however long the system", () => {
    expect(runLength(SLOW, 300)).toBeCloseTo(10, 1);
    expect(runLength(GROUND_RIG.motion, 6)).toBe(6);
  });

  it("runs a bone on a clip for one pass of the clip, so a replay fires on its frame", () => {
    expect(runLength({ kind: "bone", anchor: WALKER, target: null, period: 2.5 }, 6)).toBe(2.5);
    expect(runLength({ kind: "bone", anchor: WALKER, target: null }, 6)).toBe(6);
  });

  it("gives a still rig the system's own span", () => {
    expect(runLength({ kind: "still" }, 4.5)).toBe(4.5);
  });

  it("ends a circling missile when its lifetime runs out", () => {
    expect(runLength(missileMotion(circling(9, 3), 10), 20)).toBeCloseTo(3, 1);
  });

  it("returns the span for a circling missile that never arrives", () => {
    expect(runLength(CIRCLE, 2)).toBe(2);
    expect(runLength(CIRCLE, 20)).toBe(20);
  });

  it("returns the span for a missile with no speed", () => {
    expect(runLength({ ...SLOW, flight: level(0) }, 7)).toBe(7);
  });
});

describe("phaseAt", () => {
  it("counts a run that does not loop straight off the clock", () => {
    expect(phaseAt({ motion: SLOW, life: "once", height: 0 }, 250, 4)).toBe(250);
  });

  it("wraps a looping run on its own length rather than on when it was picked", () => {
    const rig = { motion: SLOW, life: "loop", height: 0 } as const;

    expect(phaseAt(rig, 4, 4)).toBe(4);
    expect(phaseAt(rig, 26, 4)).toBeCloseTo(6, 1);
  });

  it("wraps a still rig on the system's own span", () => {
    expect(phaseAt(withPlayback(GROUND_RIG, "replay"), 7, 3)).toBe(1);
  });

  it("wraps a looping flight past its linger tail", () => {
    const rig = { motion: SLOW, life: "loop", height: 0 } as const;

    expect(phaseAt(rig, 11, 4, 2)).toBe(11);
    expect(phaseAt(rig, 13, 4, 2)).toBeCloseTo(1, 1);
  });
});

describe("landed", () => {
  it("returns true once a missile has arrived, and never for a motion that never arrives", () => {
    expect(landed(SLOW, 9)).toBe(false);
    expect(landed(SLOW, 11)).toBe(true);
    expect(landed({ ...SLOW, flight: level(0) }, 1000)).toBe(false);
    expect(landed(CIRCLE, 1000)).toBe(false);
    expect(landed({ kind: "still" }, 1000)).toBe(false);
  });
});

describe("runSpan", () => {
  it("is the run's own length for a rig that plays once or replays", () => {
    expect(runSpan(GROUND_RIG, 4)).toBe(4);
    expect(runSpan(withPlayback(GROUND_RIG, "replay"), 4)).toBe(4);
  });

  it("spans all a seek reaches for a continuous run, which never starts over", () => {
    expect(runSpan(withPlayback(GROUND_RIG, "continuous"), 4)).toBe(CONTINUOUS_RUN);
    expect(phaseAt(withPlayback(GROUND_RIG, "continuous"), 30, 4)).toBe(30);
  });
});

describe("carrierOf and playbackOf", () => {
  it("names the half of a rig each motion and lifecycle is", () => {
    expect(carrierOf({ kind: "still" })).toBe("ground");
    expect(carrierOf(SLOW)).toBe("missile");
    expect(carrierOf(CIRCLE)).toBe("missile");
    expect(carrierOf({ kind: "bone", anchor: WALKER, target: null })).toBe("bone");
    expect(playbackOf("loop")).toBe("replay");
    expect(playbackOf("once")).toBe("once");
    expect(playbackOf("continuous")).toBe("continuous");
  });
});

describe("fliesAsMissile", () => {
  it("returns true only for a missile", () => {
    expect(fliesAsMissile(SLOW)).toBe(true);
    expect(fliesAsMissile(CIRCLE)).toBe(true);
    expect(fliesAsMissile(withCarrier(GROUND_RIG, "missile").motion)).toBe(true);
    expect(fliesAsMissile({ kind: "still" })).toBe(false);
    expect(fliesAsMissile(BONE)).toBe(false);
  });
});

describe("withCarrier", () => {
  it("stands the ground on the ground and flies a missile at flight height", () => {
    expect(GROUND_RIG.height).toBe(0);
    expect(withCarrier(GROUND_RIG, "missile").height).toBe(FLIGHT_HEIGHT);
    expect(withCarrier(withCarrier(GROUND_RIG, "missile"), "ground").height).toBe(0);
  });

  it("returns a straight missile on FIRST_FLIGHT for the missile carrier", () => {
    expect(withCarrier(GROUND_RIG, "missile").motion).toEqual(missileMotion(FIRST_FLIGHT));
  });

  it("keeps the playback, the stop and a height the author tuned", () => {
    const tuned = { ...withPlayback(GROUND_RIG, "replay"), height: 40, stopAt: 3 };
    const next = withCarrier(tuned, "missile");

    expect(next.motion.kind).toBe("missile");
    expect(next.height).toBe(40);
    expect(next.stopAt).toBe(3);
    expect(next.life).toBe("loop");
  });

  it("keeps the skeleton a child set spawns on", () => {
    const joints = () => WALKER;

    expect(withCarrier({ ...GROUND_RIG, joints }, "missile").joints).toBe(joints);
  });
});

describe("retargeted", () => {
  it("returns a still rig with the target", () => {
    expect(retargeted({ kind: "still" }, [1, 2, 3])).toEqual({ kind: "still", target: [1, 2, 3] });
  });

  it("returns a missile that aims at the target's ground point", () => {
    expect(retargeted(SLOW, [0, 7, 50])).toEqual({ ...SLOW, to: [0, 0, 50] });
  });

  it("returns null for a bone", () => {
    expect(retargeted(BONE, [1, 2, 3])).toBeNull();
    expect([SLOW, CIRCLE, BONE].map(retargetable)).toEqual([true, true, false]);
  });
});

describe("aimedAt", () => {
  it("returns the ground point at the reach in the direction of the point", () => {
    expect(aimedAt([30, 50, 40], 1000)).toEqual([600, 0, 800]);
  });

  it("returns null if the point lies on the up axis", () => {
    expect(aimedAt([0, 50, 0], 1000)).toBeNull();
  });
});
