/**
 * A missile's flight as the client moves it: the movement class, the height solver and the
 * vertical facing of a `MissileSpecification`.
 *
 * Section 2.56 of docs/plans/vfx-particle-renderer.md. The flight is simulated once at a fixed
 * step into a track, so where the missile stands is a pure function of time and a seek reaches
 * what a play reaches.
 */

import { GROUND, solveHeight, travelFraction } from "./missileHeight";
import { movementOf } from "./missileSteps";
import { add, sub, unit, type Vec } from "./missileVectors";
import type { Point } from "./rig";

/** A movement class of `MissileMovementSpec` and the fields it reads, schema defaults applied. */
export type MissileMovement =
  | { readonly kind: "fixedSpeed"; readonly speed: number }
  | { readonly kind: "fixedTime"; readonly travelTime: number }
  | ({ readonly kind: "accelerating" } & Acceleration)
  | ({ readonly kind: "decelToLocation" } & Acceleration)
  | { readonly kind: "fixedSpeedSpline"; readonly speed: number; readonly spline: MissileSpline }
  | {
      readonly kind: "fixedTimeSpline";
      readonly travelTime: number;
      readonly spline: MissileSpline;
    }
  | {
      readonly kind: "physics";
      readonly initialSpeed: number;
      readonly drag: number;
      readonly lifetime: number;
    }
  | {
      readonly kind: "circle";
      readonly angularVelocity: number;
      readonly linearVelocity: number;
      readonly radialVelocity: number;
      readonly lifetime: number;
    }
  | {
      readonly kind: "syncCircle";
      readonly angularVelocity: number;
      readonly lifetime: number;
      /** `mAxisOfRotation`: 0 turns in the `YZ` plane, 1 in the ground plane, 2 in `XY`. */
      readonly axis: number;
    };

export type MissileMovementKind = MissileMovement["kind"];

/** The fields that `AcceleratingMovement` and `DecelToLocationMovement` share. */
export interface Acceleration {
  readonly initialSpeed: number;
  readonly acceleration: number;
  readonly minSpeed: number;
  readonly maxSpeed: number;
}

/** A `HermiteSplineInfo`, in the frame whose `Z` faces the target and whose `Y` is up. */
export interface MissileSpline {
  readonly startOffset: Point;
  /** The start tangent, as a share of the horizontal travel distance. */
  readonly control1: Point;
  /** The end tangent, as a share of the horizontal travel distance. */
  readonly control2: Point;
  /** `mUseMissilePositionAsOrigin`: the curve starts at the launch point, not the caster's feet. */
  readonly fromMissile: boolean;
}

/** A `heightSolver` class and its fields, which replace the height the movement gives. */
export type MissileHeight =
  | { readonly kind: "blendedLinear" }
  | { readonly kind: "gravity"; readonly gravity: number }
  | { readonly kind: "followTerrain"; readonly heightOffset: number; readonly maxSlope: number }
  | {
      readonly kind: "sinusoidal";
      readonly amplitude: number;
      readonly periods: number;
      readonly verticalOffset: number;
      readonly phase: number;
    }
  | { readonly kind: "curveTheDifference"; readonly initialTargetHeightOffset: number };

export type MissileHeightKind = MissileHeight["kind"];

/** The `verticalFacing` class, which sets how the missile pitches. */
export type MissileFacing = "none" | "matchVelocity" | "faceTarget";

/** Everything a `MissileSpecification` says about how its missile travels. */
export interface MissileFlight {
  readonly movement: MissileMovement;
  readonly height: MissileHeight | null;
  readonly facing: MissileFacing;
  /** `mUseHeightOffsetAtEnd`: the target stands at the launch height rather than on the ground. */
  readonly endAtLaunchHeight: boolean;
  /** `mOffsetInitialTargetHeight` and `mTargetHeightAugment`, added to the target's height. */
  readonly targetOffset: number;
}

/** The step a flight is simulated at, in seconds. */
export const FLIGHT_STEP = 1 / 120;

/** The longest flight simulated, in seconds. A circle with no lifetime circles this long. */
export const LONGEST_FLIGHT = 30;

/** A flight simulated into samples, one per `FLIGHT_STEP`. */
export interface FlightTrack {
  /** Each sample's position, three floats a sample. */
  readonly positions: Float32Array;
  /** Each sample's velocity, three floats a sample, which the missile faces along. */
  readonly velocities: Float32Array;
  /** Seconds until the movement completes, and null for one that runs past `LONGEST_FLIGHT`. */
  readonly arrival: number | null;
}

/** A flight between a launch point and a target, which `flightTrack` simulates. */
export interface FlightPlan {
  readonly flight: MissileFlight;
  /** Where the missile launches, on the ground. The launch height lifts it. */
  readonly from: Point;
  /** Where the missile aims, on the ground. */
  readonly to: Point;
  readonly launchHeight: number;
}

/**
 * Returns the track of `plan`, simulated at `FLIGHT_STEP` until the movement completes.
 *
 * The target resolves as the client resolves it: its height is the ground's, or the launch
 * height under `endAtLaunchHeight`, plus `targetOffset`. A target on the launch point moves 5
 * units ahead, as the client moves it along the caster's facing.
 */
export function flightTrack(plan: FlightPlan): FlightTrack {
  const { flight } = plan;
  const start: Vec = [plan.from[0], plan.from[1] + plan.launchHeight, plan.from[2]];
  const target: Vec = [
    plan.to[0],
    (flight.endAtLaunchHeight ? plan.launchHeight : GROUND) + plan.to[1] + flight.targetOffset,
    plan.to[2],
  ];
  if (start[0] === target[0] && start[2] === target[2]) target[2] += 5;

  const move = movementOf(flight.movement, start, target);
  const most = Math.ceil(LONGEST_FLIGHT / FLIGHT_STEP);
  const positions: number[] = [...start];
  const velocities: number[] = [...move.velocity];
  const position: Vec = [...start];
  let arrival: number | null = null;

  for (let step = 1; step <= most; step += 1) {
    const now = step * FLIGHT_STEP;
    const tick = move.step(position, now, FLIGHT_STEP);
    const next = add(position, tick.displacement);

    if (flight.height !== null) {
      const fraction = tick.fraction ?? travelFraction(start, next, target, tick.arrived);
      next[1] = solveHeight(flight.height, start, target, position, next, tick.velocity, fraction);
    }

    const velocity: Vec = [...tick.velocity];
    if (flight.facing === "matchVelocity") velocity[1] = (next[1] - position[1]) / FLIGHT_STEP;
    if (flight.facing === "faceTarget") {
      velocity[1] = tick.speed * unit(sub(target, next))[1];
    }

    position[0] = next[0];
    position[1] = next[1];
    position[2] = next[2];
    positions.push(...position);
    velocities.push(...velocity);

    if (tick.arrived) {
      arrival = now;
      break;
    }
  }

  /* A circle launches with no velocity of its own, so it faces along its first step. */
  if (move.velocity.every((axis) => axis === 0) && velocities.length >= 6) {
    velocities.copyWithin(0, 3, 6);
  }

  return {
    positions: Float32Array.from(positions),
    velocities: Float32Array.from(velocities),
    arrival,
  };
}

/** Returns where the missile of `track` stands `time` seconds into its flight. */
export function trackPositionAt(track: FlightTrack, time: number): Point {
  return sampleAt(track.positions, time);
}

/** Returns the direction the missile of `track` travels `time` seconds into its flight. */
export function trackDirectionAt(track: FlightTrack, time: number): Point {
  const at = Math.min(Math.max(Math.round(time / FLIGHT_STEP), 0), samples(track) - 1);
  const velocity: Vec = [
    track.velocities[at * 3] ?? 0,
    track.velocities[at * 3 + 1] ?? 0,
    track.velocities[at * 3 + 2] ?? 0,
  ];
  return unit(velocity);
}

function samples(track: FlightTrack): number {
  return track.positions.length / 3;
}

/** Interpolates the samples of `values` at `time`, holding the last past the end. */
function sampleAt(values: Float32Array, time: number): Point {
  const last = values.length / 3 - 1;
  const at = Math.min(Math.max(time / FLIGHT_STEP, 0), last);
  const low = Math.floor(at);
  const high = Math.min(low + 1, last);
  const share = at - low;
  const read = (axis: number) => {
    const from = values[low * 3 + axis] ?? 0;
    return from + ((values[high * 3 + axis] ?? 0) - from) * share;
  };

  return [read(0), read(1), read(2)];
}
