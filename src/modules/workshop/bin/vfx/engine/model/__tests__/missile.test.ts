import { describe, expect, it } from "vitest";

import {
  FLIGHT_STEP,
  type FlightPlan,
  flightTrack,
  type MissileFlight,
  type MissileMovement,
  trackDirectionAt,
  trackPositionAt,
} from "../missile";

const LEVEL: Omit<MissileFlight, "movement"> = {
  height: null,
  facing: "matchVelocity",
  endAtLaunchHeight: true,
  targetOffset: 0,
};

function plan(movement: MissileMovement, over: Partial<MissileFlight> = {}): FlightPlan {
  return {
    flight: { ...LEVEL, movement, ...over },
    from: [0, 0, 0],
    to: [1000, 0, 0],
    launchHeight: 100,
  };
}

describe("flightTrack", () => {
  it("arrives on the target after distance over speed under fixedSpeed", () => {
    const track = flightTrack(plan({ kind: "fixedSpeed", speed: 2000 }));

    expect(track.arrival).toBeCloseTo(0.5, 1);
    expect(trackPositionAt(track, 10)).toEqual([1000, 100, 0]);
  });

  it("flies a straight line down to the ground if the target stands on it", () => {
    const track = flightTrack(
      plan({ kind: "fixedSpeed", speed: 1000 }, { endAtLaunchHeight: false }),
    );
    const halfway = trackPositionAt(track, 0.5);

    expect(halfway[0]).toBeCloseTo(500, 0);
    expect(halfway[1]).toBeCloseTo(50, 0);
    expect(trackPositionAt(track, 10)[1]).toBeCloseTo(0, 3);
  });

  it("arrives when the travel time runs out under fixedTime", () => {
    const track = flightTrack(plan({ kind: "fixedTime", travelTime: 0.8 }));

    expect(track.arrival).toBeCloseTo(0.8, 2);
    expect(trackPositionAt(track, 0.4)[0]).toBeCloseTo(500, -1);
  });

  it("arrives sooner than its launch speed allows if accelerating, and holds its top speed", () => {
    const accelerating = flightTrack(
      plan({
        kind: "accelerating",
        initialSpeed: 500,
        acceleration: 4000,
        minSpeed: 500,
        maxSpeed: 1500,
      }),
    );
    const top = Math.hypot(
      ...[0, 2].map((axis) => {
        const late = trackPositionAt(accelerating, 0.6)[axis]!;
        return trackPositionAt(accelerating, 0.6 + FLIGHT_STEP)[axis]! - late;
      }),
    );

    expect(accelerating.arrival).toBeLessThan(2);
    expect(top / FLIGHT_STEP).toBeCloseTo(1500, -1);
  });

  it("follows a spline that leaves to the side its first tangent points and lands on the target", () => {
    const track = flightTrack(
      plan({
        kind: "fixedTimeSpline",
        travelTime: 1,
        spline: {
          startOffset: [0, 0, 0],
          control1: [1, 0, 0],
          control2: [0, 0, 1],
          fromMissile: true,
        },
      }),
    );

    expect(track.arrival).toBeCloseTo(1, 1);
    expect(Math.abs(trackPositionAt(track, 0.25)[2])).toBeGreaterThan(50);
    const landed = trackPositionAt(track, 10);
    expect(landed[0]).toBeCloseTo(1000, 0);
    expect(landed[2]).toBeCloseTo(0, 0);
  });

  it("arcs above the straight line by gravity times the flight time squared over eight", () => {
    const track = flightTrack(
      plan({ kind: "fixedSpeed", speed: 1000 }, { height: { kind: "gravity", gravity: 4000 } }),
    );

    expect(trackPositionAt(track, 0.5)[1]).toBeCloseTo(100 + (4000 * 1 * 1) / 8, -1);
    expect(trackDirectionAt(track, 0.1)[1]).toBeGreaterThan(0);
    expect(trackDirectionAt(track, 0.9)[1]).toBeLessThan(0);
  });

  it("blends the height toward the target along the travel fraction to the three quarters power", () => {
    const track = flightTrack(
      plan(
        { kind: "fixedSpeed", speed: 1000 },
        { height: { kind: "blendedLinear" }, endAtLaunchHeight: false, targetOffset: 20 },
      ),
    );

    expect(trackPositionAt(track, 0.5)[1]).toBeCloseTo(100 + (20 - 100) * 0.5 ** 0.75, 0);
    expect(trackPositionAt(track, 10)[1]).toBeCloseTo(20, 1);
  });

  it("circles the target at the launch distance until its lifetime ends", () => {
    const track = flightTrack(
      plan({
        kind: "circle",
        angularVelocity: Math.PI,
        linearVelocity: 0,
        radialVelocity: 0,
        lifetime: 2,
      }),
    );
    const [x, , z] = trackPositionAt(track, 0.5);

    expect(Math.hypot(x - 1000, z)).toBeCloseTo(1000, 0);
    expect(track.arrival).toBeCloseTo(2, 1);
  });

  it("drags a physics missile toward the launch speed over the drag", () => {
    const track = flightTrack(plan({ kind: "physics", initialSpeed: 1000, drag: 2, lifetime: 5 }));

    expect(trackPositionAt(track, 4.9)[0]).toBeCloseTo(500, -1);
    expect(track.arrival).toBeCloseTo(5, 1);
  });

  it("runs a circle with no lifetime past the longest flight without arriving", () => {
    const track = flightTrack(
      plan({ kind: "syncCircle", angularVelocity: 1, lifetime: 0, axis: 1 }),
    );

    expect(track.arrival).toBeNull();
  });
});
