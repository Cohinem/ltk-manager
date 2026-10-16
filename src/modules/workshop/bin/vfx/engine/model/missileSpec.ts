import type {
  MissileFacing as SpecFacing,
  MissileHeight as SpecHeight,
  MissileMovement as SpecMovement,
  MissileSpec,
  MissileSpline as SpecSpline,
} from "@/lib/tauri";

import type {
  MissileFacing,
  MissileFlight,
  MissileHeight,
  MissileMovement,
  MissileSpline,
} from "./missile";
import type { Point } from "./rig";

/** The speed a missile flies at if neither its movement nor its spell's `missileSpeed` writes one. */
export const FALLBACK_SPEED = 1800;

/** `HermiteSplineInfo`'s defaults for the two tangents. */
const SPLINE_START_TANGENT = [-1, 0, 0] as const;
const SPLINE_END_TANGENT = [1, 0, 0] as const;

/**
 * Returns the flight that `spec` describes, with the schema's defaults for omitted fields.
 *
 * A movement that writes no speed flies at `fallback`, which a caller sets to the spell's
 * `missileSpeed`, as the client does. Returns null if the movement class is missing or cannot be
 * simulated. An unsupported height solver or vertical facing is dropped.
 */
export function flightOf(spec: MissileSpec, fallback = FALLBACK_SPEED): MissileFlight | null {
  const movement = movementOf(spec.movement, fallback);
  if (movement === null) return null;

  const atLaunch = spec.heightOffsetAtEnd ?? false;
  return {
    movement,
    height: spec.height == null ? null : heightOf(spec.height),
    facing: facingOf(spec.facing),
    endAtLaunchHeight: atLaunch,
    targetOffset: (spec.initialTargetHeight ?? 0) + (atLaunch ? (spec.targetHeight ?? 0) : 0),
  };
}

function movementOf(movement: SpecMovement, fallback: number): MissileMovement | null {
  switch (movement.kind) {
    case "fixedSpeed":
      return { kind: "fixedSpeed", speed: speedOf(movement.speed, fallback) };
    case "fixedTime":
      return { kind: "fixedTime", travelTime: movement.duration ?? 0 };
    case "accelerating":
    case "decelToLocation":
      return {
        kind: movement.kind,
        initialSpeed: movement.initialSpeed ?? 0,
        acceleration: movement.acceleration ?? 0,
        minSpeed: movement.minSpeed ?? 0,
        maxSpeed: movement.maxSpeed ?? 0,
      };
    case "fixedSpeedSpline":
      return {
        kind: "fixedSpeedSpline",
        speed: speedOf(movement.speed, fallback),
        spline: splineOf(movement.spline),
      };
    case "fixedTimeSpline":
      return {
        kind: "fixedTimeSpline",
        travelTime: movement.duration ?? 0,
        spline: splineOf(movement.spline),
      };
    case "physics":
      return {
        kind: "physics",
        initialSpeed: movement.initialSpeed ?? 0,
        drag: movement.drag ?? 1,
        lifetime: movement.lifetime ?? 0,
      };
    case "circle":
      return {
        kind: "circle",
        angularVelocity: movement.angularVelocity ?? 0,
        linearVelocity: movement.linearVelocity ?? 0,
        radialVelocity: movement.radialVelocity ?? 0,
        lifetime: movement.lifetime ?? 0,
      };
    case "syncCircle":
      return {
        kind: "syncCircle",
        angularVelocity: movement.angularVelocity ?? 0,
        lifetime: movement.lifetime ?? 0,
        axis: movement.axis ?? 1,
      };
    case "unsupported":
    case "missing":
      return null;
  }
}

function speedOf(speed: number | null, fallback: number): number {
  return speed !== null && speed > 0 ? speed : fallback;
}

function splineOf(spline: SpecSpline | null): MissileSpline {
  return {
    startOffset: pointOf(spline?.startOffset, [0, 0, 0]),
    control1: pointOf(spline?.control1, SPLINE_START_TANGENT),
    control2: pointOf(spline?.control2, SPLINE_END_TANGENT),
    fromMissile: spline?.fromMissile ?? false,
  };
}

/** `vector` as a point, or `fallback` where the spec omits it. */
function pointOf(vector: SpecSpline["control1"] | undefined, fallback: Point): Point {
  if (vector == null) return fallback;
  return [vector[0] ?? 0, vector[1] ?? 0, vector[2] ?? 0];
}

function heightOf(height: SpecHeight): MissileHeight | null {
  switch (height.kind) {
    case "blendedLinear":
      return { kind: "blendedLinear" };
    case "gravity":
      return { kind: "gravity", gravity: height.gravity ?? 0 };
    case "followTerrain":
      return {
        kind: "followTerrain",
        heightOffset: height.heightOffset ?? 0,
        maxSlope: height.maxSlope ?? 10,
      };
    case "sinusoidal":
      return {
        kind: "sinusoidal",
        amplitude: height.amplitude ?? 0,
        periods: height.periods ?? 0,
        verticalOffset: height.verticalOffset ?? 0,
        phase: height.phase ?? 0,
      };
    case "curveTheDifference":
      return {
        kind: "curveTheDifference",
        initialTargetHeightOffset: height.initialTargetHeightOffset ?? 0,
      };
    case "unsupported":
      return null;
  }
}

function facingOf(facing: SpecFacing | null): MissileFacing {
  if (facing?.kind === "matchVelocity") return "matchVelocity";
  if (facing?.kind === "faceTarget") return "faceTarget";
  return "none";
}
