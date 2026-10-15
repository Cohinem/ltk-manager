/**
 * One tick of each missile movement class and each height solver, which `flightTrack` steps.
 *
 * Section 2.56 of docs/plans/vfx-particle-renderer.md.
 */

import type { Acceleration, MissileMovement, MissileSpline } from "./missile";
import { GROUND } from "./missileHeight";
import {
  add,
  clamp,
  dot,
  flat,
  flatDot,
  horizontalLength,
  scale,
  sub,
  unit,
  type Vec,
} from "./missileVectors";

/** The step `FixedSpeedSplineMovement` measures arc length in, over the curve's parameter. */
const ARC_STEP = 1 / 128;

/** How near the target, in engine units, a step that ends there counts as having arrived. */
const ARRIVAL_REACH = 1e-3;

/** What one movement step gives, before the height solver and the facing. */
export interface Tick {
  readonly displacement: Vec;
  readonly velocity: Vec;
  readonly speed: number;
  readonly arrived: boolean;
  /** The spline parameter, which a spline gives the height solver in place of the travel fraction. */
  readonly fraction?: number;
}

/** One movement in flight, stepped once per tick. */
export interface Movement {
  /** The velocity at launch. */
  readonly velocity: Vec;
  step(position: Vec, now: number, dt: number): Tick;
}

export function movementOf(movement: MissileMovement, start: Vec, target: Vec): Movement {
  switch (movement.kind) {
    case "fixedSpeed":
      return fixedSpeed(movement.speed, start, target);
    case "fixedTime":
      return fixedTime(movement.travelTime, start, target);
    case "accelerating":
      return accelerating(movement, start, target, false);
    case "decelToLocation":
      return accelerating(movement, start, target, true);
    case "fixedSpeedSpline":
      return splineMovement(movement.spline, start, target, { speed: movement.speed });
    case "fixedTimeSpline":
      return splineMovement(movement.spline, start, target, { travelTime: movement.travelTime });
    case "physics":
      return physics(movement, start, target);
    case "circle":
      return circle(movement, start, target);
    case "syncCircle":
      return syncCircle(movement, start, target);
  }
}

/** `FixedSpeedMovement`: a straight 3D line at a constant horizontal speed. */
function fixedSpeed(speed: number, start: Vec, target: Vec): Movement {
  return {
    velocity: horizontalLength(sub(target, start), speed),
    step(position, _now, dt) {
      const velocity = horizontalLength(sub(target, position), speed);
      return landing(position, target, velocity, scale(velocity, dt), speed);
    },
  };
}

/** `FixedTimeMovement`: the speed that reaches the target as `travelTime` runs out. */
function fixedTime(travelTime: number, start: Vec, target: Vec): Movement {
  let speed = travelTime > 0 ? flat(sub(target, start)) / travelTime : 0;

  return {
    velocity: horizontalLength(sub(target, start), speed),
    step(position, now, dt) {
      const remaining = travelTime - (now - dt);
      if (remaining >= 1e-9) speed = flat(sub(target, position)) / remaining;
      const velocity = horizontalLength(sub(target, position), speed);
      const arrived = now >= travelTime;
      const displacement = arrived
        ? sub(target, position)
        : scale(velocity, Math.min(remaining, dt));
      return { displacement, velocity, speed, arrived };
    },
  };
}

/**
 * `AcceleratingMovement`, and `DecelToLocationMovement` with `brakes`: a speed changed by
 * `acceleration` within its clamps, re-aimed at the target each tick.
 */
function accelerating(fields: Acceleration, start: Vec, target: Vec, brakes: boolean): Movement {
  const { minSpeed: least, maxSpeed: most } = fields;
  const rate = brakes ? Math.abs(fields.acceleration) : fields.acceleration;
  let speed = fields.initialSpeed;
  let velocity = horizontalLength(sub(target, start), speed);

  return {
    velocity,
    step(position, _now, dt) {
      const remaining = flat(sub(target, position));
      if (brakes && (speed * speed) / (2 * rate || 1) >= remaining) {
        const ahead = horizontalLength(sub(target, position), 1);
        const travel = Math.max(speed * dt - 0.5 * rate * dt * dt, 0);
        speed = Math.max(speed - rate * dt, 0);
        velocity = scale(ahead, speed);
        return landing(position, target, velocity, scale(ahead, travel), speed, speed <= 0);
      }

      const along = unit(velocity);
      const held = clamp(speed, least, most);
      const pinned = (rate < 0 && speed === least) || (rate > 0 && speed === most);
      let displacement: Vec;
      if (pinned || rate === 0) {
        displacement = scale(velocity, dt);
      } else if (held + rate * dt > least && held + rate * dt < most) {
        displacement = add(scale(velocity, dt), scale(along, 0.5 * rate * dt * dt));
      } else {
        /* The speed reaches a clamp inside the step and holds it for the rest. */
        const limit = rate > 0 ? most : least;
        const until = (limit - held) / rate;
        const ramp = add(scale(velocity, until), scale(along, 0.5 * rate * until * until));
        displacement = add(ramp, scale(along, (dt - until) * limit));
      }

      if (remaining > 0.001) {
        if (rate !== 0) speed = clamp(speed + rate * dt, least, most);
        velocity = horizontalLength(sub(target, position), speed);
      }
      return landing(position, target, velocity, displacement, speed);
    },
  };
}

/** `PhysicsMovement`: a launch along the line to the target that drag slows exponentially. */
function physics(
  fields: Extract<MissileMovement, { kind: "physics" }>,
  start: Vec,
  target: Vec,
): Movement {
  const direction = unit(sub(target, start));
  const reach = fields.drag !== 0 ? 1 / fields.drag : 1e6;
  const at = (time: number): Vec => {
    const along = fields.initialSpeed * reach * (1 - Math.exp(-time / reach));
    return [start[0] + direction[0] * along, start[1], start[2] + direction[2] * along];
  };

  return {
    velocity: scale(direction, fields.initialSpeed),
    step(position, now, dt) {
      const displacement = sub(at(now), position);
      const velocity = scale(displacement, 1 / dt);
      return {
        displacement,
        velocity,
        speed: flat(velocity),
        arrived: now > fields.lifetime,
      };
    },
  };
}

/** `CircleMovement`: a circle about the target whose angle and radius change each tick. */
function circle(
  fields: Extract<MissileMovement, { kind: "circle" }>,
  start: Vec,
  center: Vec,
): Movement {
  let radius = Math.hypot(start[0] - center[0], start[2] - center[2]);
  let angle = Math.atan2(start[2] - center[2], start[0] - center[0]);

  return {
    velocity: [0, 0, 0],
    step(position, now, dt) {
      const turn =
        fields.angularVelocity !== 0
          ? fields.angularVelocity
          : radius > 0
            ? fields.linearVelocity / radius
            : 0;
      angle += turn * dt;
      const next: Vec = [
        center[0] + radius * Math.cos(angle),
        center[1],
        center[2] + radius * Math.sin(angle),
      ];
      radius += fields.radialVelocity * dt;
      const displacement = sub(next, position);
      return {
        displacement,
        velocity: scale(displacement, 1 / dt),
        speed: Math.abs(turn * radius) || fields.linearVelocity,
        arrived: fields.lifetime > 0 && now > fields.lifetime,
      };
    },
  };
}

/** `SyncCircleMovement`: a circle about the target whose angle follows the time since launch. */
function syncCircle(
  fields: Extract<MissileMovement, { kind: "syncCircle" }>,
  start: Vec,
  center: Vec,
): Movement {
  const radius = Math.hypot(start[0] - center[0], start[2] - center[2]);
  const first = Math.atan2(start[2] - center[2], start[0] - center[0]);
  const at = (time: number): Vec => {
    const angle = first + fields.angularVelocity * time;
    const [cos, sin] = [radius * Math.cos(angle), radius * Math.sin(angle)];
    if (fields.axis === 0) return [center[0], center[1] + cos, center[2] + sin];
    if (fields.axis === 2) return [center[0] + cos, center[1] + sin, center[2]];
    return [center[0] + cos, center[1], center[2] + sin];
  };

  return {
    velocity: [0, 0, 0],
    step(position, now, dt) {
      const displacement = sub(at(now), position);
      return {
        displacement,
        velocity: scale(displacement, 1 / dt),
        speed: Math.abs(fields.angularVelocity * radius),
        arrived: fields.lifetime > 0 && now > fields.lifetime,
      };
    },
  };
}

/**
 * The two spline movements: a cubic Hermite curve in the frame that faces the target, whose
 * parameter runs over `travelTime` or advances by arc length at `speed`.
 */
function splineMovement(
  spline: MissileSpline,
  start: Vec,
  target: Vec,
  pace: { readonly speed?: number; readonly travelTime?: number },
): Movement {
  const origin: Vec = spline.fromMissile ? [...start] : [start[0], GROUND, start[2]];
  const forward = horizontalLength(sub(target, origin), 1);
  const right: Vec = [forward[2], 0, -forward[0]];
  const relative = sub(target, origin);
  const end: Vec = [dot(relative, right), relative[1], dot(relative, forward)];
  const offset: Vec = [...spline.startOffset];
  const distance = Math.hypot(end[2] - offset[2], end[0] - offset[0]);
  const t0 = scale([...spline.control1], distance);
  const t1 = scale([...spline.control2], distance);

  const local = (t: number): Vec => {
    const [t2, t3] = [t * t, t * t * t];
    const weights = [2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, 3 * t2 - 2 * t3, t3 - t2];
    return [0, 1, 2].map(
      (axis) =>
        weights[0]! * offset[axis]! +
        weights[1]! * t0[axis]! +
        weights[2]! * end[axis]! +
        weights[3]! * t1[axis]!,
    ) as Vec;
  };
  const tangent = (t: number): Vec => {
    const [a, b, c] = [6 * t * t - 6 * t, 3 * t * t - 4 * t + 1, 3 * t * t - 2 * t];
    return [0, 1, 2].map(
      (axis) => a * (offset[axis]! - end[axis]!) + b * t0[axis]! + c * t1[axis]!,
    ) as Vec;
  };
  const world = (point: Vec): Vec => [
    origin[0] + point[0] * right[0] + point[2] * forward[0],
    origin[1] + point[1],
    origin[2] + point[0] * right[2] + point[2] * forward[2],
  ];
  const worldDirection = (point: Vec): Vec =>
    unit([
      point[0] * right[0] + point[2] * forward[0],
      point[1],
      point[0] * right[2] + point[2] * forward[2],
    ]);

  let t = 0;
  return {
    velocity: worldDirection(tangent(0)),
    step(position, _now, dt) {
      if (pace.travelTime !== undefined) {
        t = pace.travelTime > 0 ? t + dt / pace.travelTime : 1;
      } else {
        let left = dt * (pace.speed ?? 0);
        while (left > 0 && t < 1) {
          const slope = tangent(t);
          const piece = Math.hypot(slope[0], slope[2]) * ARC_STEP;
          if (piece <= 0) break;
          if (piece >= left) {
            t += (ARC_STEP * left) / piece;
            left = 0;
          } else {
            t += ARC_STEP;
            left -= piece;
          }
        }
      }

      const arrived = t >= 1;
      const at = Math.min(t, 1);
      const velocity = worldDirection(tangent(at));
      return {
        displacement: sub(world(local(at)), position),
        velocity,
        speed: pace.speed ?? (pace.travelTime ? distance / pace.travelTime : 0),
        arrived,
        fraction: at,
      };
    },
  };
}

/**
 * Returns `displacement` as a step toward `target`, with the arrival test of
 * `MissileMovement_HasArrived`: the step passes the target, or `stopped` holds. An arriving step
 * lands on the target.
 */
function landing(
  position: Vec,
  target: Vec,
  velocity: Vec,
  displacement: Vec,
  speed: number,
  stopped = false,
): Tick {
  const next = add(position, displacement);
  const toTarget = sub(target, position);
  const passed =
    (position[0] === target[0] && position[2] === target[2]) ||
    (flatDot(velocity, toTarget) > 0 && flatDot(velocity, sub(target, next)) <= 0);
  /* The summed steps land a hair short of an exact multiple of the distance, which is arrival. */
  const arrived = passed || stopped || flat(sub(target, next)) <= ARRIVAL_REACH;

  return { displacement: arrived ? toTarget : displacement, velocity, speed, arrived };
}
