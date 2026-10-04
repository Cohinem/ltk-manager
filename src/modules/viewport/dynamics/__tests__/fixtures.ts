import type { JointModel, Quat, SkeletonModel, Vec3 } from "../../assets/parsing/skeletonBuffer";
import { axisAngleInto, UP, yawOf } from "../math";
import type {
  ChainModel,
  ChainProperties,
  OrientationModel,
  ScaledCurve,
  TreeGroup,
} from "../model";
import type { Motion } from "../motion";
import {
  type BakedPose,
  type BakeOptions,
  createBake,
  type DynamicsRig,
  type Take,
  TAKE_FLOATS,
} from "../take";
import { bindLocals } from "../world";

export const STILL: Quat = [0, 0, 0, 1];

export function joint(
  name: string,
  parent: number,
  translation: Vec3,
  rotation: Quat = STILL,
): JointModel {
  return {
    name,
    hash: 0,
    parent,
    translation,
    rotation,
    scale: [1, 1, 1],
    inverseBind: new Float32Array(16),
  };
}

export function skeletonOf(...joints: JointModel[]): SkeletonModel {
  return { joints, influences: Uint32Array.from(joints, (_, slot) => slot) };
}

export function parentsOf(skeleton: SkeletonModel): Int32Array {
  return Int32Array.from(skeleton.joints, (each) => each.parent);
}

/** A root, a tail of two joints hanging back along `-z`, and a pauldron beside it. */
export const TAILED = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("Tail1", 0, [0, 0, -10]),
  joint("Tail2", 1, [0, 0, -10]),
  joint("Pauldron", 0, [20, 0, 0]),
);

/** The joints of `TAILED` with the tail hanging straight down, where gravity leaves it. */
export const HANGING = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("Tail1", 0, [0, -10, 0]),
  joint("Tail2", 1, [0, -10, 0]),
  joint("Pauldron", 0, [20, 0, 0]),
);

/** An orientation, off by default, that points the pauldron's `-z` along `+x`: a quarter turn back. */
export const AIMED: OrientationModel = {
  joints: [3],
  planeConstraint: 1,
  tiltAxis: 0,
  aimAxis: 3,
  aimNegated: true,
  flipped: false,
  maxAngle: 180,
  defaultOn: false,
  source: { vector: [1, 0, 0], position: false, rides: false },
};

/** A pose that stands in `skeleton`'s bind pose at every time. */
export function bindPose(skeleton: SkeletonModel, duration = 0) {
  const locals = bindLocals(skeleton);
  return {
    duration,
    localsInto: (_time: number, out: Float32Array) => {
      out.set(locals);
      return out;
    },
  };
}

export function constant(value: number): ScaledCurve {
  return { value, useCurve: false, curve: null };
}

export function properties(over: Partial<ChainProperties> = {}): ChainProperties {
  return {
    useRodPhysics: false,
    damping: constant(0),
    attraction: constant(0),
    radius: constant(0),
    envelope: constant(1),
    limitAngle: constant(180),
    stretch: constant(0),
    rodBend: constant(1),
    rodTwist: constant(1),
    rodStretch: constant(1),
    rodShear: constant(1),
    ...over,
  };
}

export function group(over: Partial<TreeGroup> = {}): TreeGroup {
  return {
    trees: [],
    properties: properties(),
    sharedCurveLength: false,
    lateralLinks: false,
    lateralLinkMaterial: 2,
    restLengthFromPose: true,
    tipsWithoutRadius: false,
    ...over,
  };
}

export function chain(groups: TreeGroup[], over: Partial<ChainModel> = {}): ChainModel {
  return {
    defaultOn: true,
    globalEnvelope: 1,
    gravityScale: 1,
    gravityOverride: null,
    groups,
    colliders: null,
    ...over,
  };
}

export function rounded(values: ArrayLike<number>, digits = 4): number[] {
  const scale = 10 ** digits;
  return Array.from(values, (value) => Math.round(value * scale) / scale + 0);
}

/** `rig` baked over `pose` and `motion` in one go. */
export function bake(
  rig: DynamicsRig,
  pose: BakedPose,
  motion: Motion,
  options: BakeOptions,
): Take {
  return createBake(rig, pose, motion, options).run() as Take;
}

/** How far the joint at place `index` of a take is turned about the up axis at `frame`, in degrees. */
export function yawAt(take: Take, frame: number, index = 0): number {
  const at = (frame * take.slots.length + index) * TAKE_FLOATS + 3;
  return Math.round((yawOf(take.locals.subarray(at, at + 4)) * 180) / Math.PI);
}

/** The ways a test moves the unit under a bake. */
export interface LegChoice {
  readonly kind: "stand" | "run" | "runAndStop" | "turn" | "strafeTurn" | "custom";
  /** Units a second the unit runs at. */
  readonly speed: number;
  /** Degrees a second the unit turns at. */
  readonly turnRate: number;
  /** Seconds into the pass a custom motion stops at, and null to never stop. */
  readonly stopAt: number | null;
}

const DEFAULT_LEGS: LegChoice = { kind: "stand", speed: 340, turnRate: 180, stopAt: null };

/** How long a strafe turn takes to turn its quarter, at most a quarter of the pass. */
const QUARTER_TURN_SECONDS = 0.25;

/** One stretch of a pass moved at one speed and one turn rate. */
interface Leg {
  /** Seconds into the pass the leg ends. */
  readonly until: number;
  readonly speed: number;
  /** Radians a second. */
  readonly turn: number;
}

/**
 * A motion over passes of `period` seconds: a few legs of constant speed and turn rate,
 * repeated each pass from where the last pass left the unit.
 */
export function motion(over: Partial<LegChoice> = {}, period = 1): Motion {
  const choice = { ...DEFAULT_LEGS, ...over };
  const turn = (choice.turnRate * Math.PI) / 180;
  const half = period / 2;

  switch (choice.kind) {
    case "stand":
      return legMotion(period, [{ until: period, speed: 0, turn: 0 }]);
    case "run":
      return legMotion(period, [{ until: period, speed: choice.speed, turn: 0 }]);
    case "runAndStop":
      return legMotion(period, [
        { until: half, speed: choice.speed, turn: 0 },
        { until: period, speed: 0, turn: 0 },
      ]);
    case "turn":
      return legMotion(period, [{ until: period, speed: 0, turn }]);
    case "strafeTurn": {
      const span = Math.min(QUARTER_TURN_SECONDS, period / 4);
      return legMotion(period, [
        { until: half - span / 2, speed: choice.speed, turn: 0 },
        { until: half + span / 2, speed: choice.speed, turn: Math.PI / 2 / span },
        { until: period, speed: choice.speed, turn: 0 },
      ]);
    }
    case "custom": {
      const stop = Math.min(Math.max(choice.stopAt ?? period, 0), period);
      return legMotion(period, [
        { until: stop, speed: choice.speed, turn },
        { until: period, speed: 0, turn: 0 },
      ]);
    }
  }
}

/** Where the unit stands in the plane and which way it faces. */
interface Stance {
  x: number;
  z: number;
  yaw: number;
}

function legMotion(period: number, legs: readonly Leg[]): Motion {
  const pass: Stance = { x: 0, z: 0, yaw: 0 };
  walk(pass, legs, period);

  return {
    rootInto(time, out) {
      const passes = Math.max(Math.floor(time / period), 0);
      const stance: Stance = { x: 0, z: 0, yaw: 0 };
      /* Each pass starts where the last ended, turned by what the last turned. */
      for (let done = 0; done < passes; done += 1) {
        const sine = Math.sin(stance.yaw);
        const cosine = Math.cos(stance.yaw);
        stance.x += pass.x * cosine + pass.z * sine;
        stance.z += pass.z * cosine - pass.x * sine;
        stance.yaw += pass.yaw;
      }
      walk(stance, legs, Math.max(time, 0) - passes * period);

      out.position[0] = stance.x;
      out.position[1] = 0;
      out.position[2] = stance.z;
      axisAngleInto(out.rotation, 0, UP, 0, stance.yaw);
      return out;
    },
  };
}

/** `stance` moved along `legs` for `seconds` of one pass. */
function walk(stance: Stance, legs: readonly Leg[], seconds: number): void {
  let from = 0;
  for (const leg of legs) {
    const span = Math.min(leg.until, seconds) - from;
    from = leg.until;
    if (span <= 0) continue;

    const yaw = stance.yaw;
    const turned = yaw + leg.turn * span;
    if (Math.abs(leg.turn) < 1e-9) {
      stance.x += Math.sin(yaw) * leg.speed * span;
      stance.z += Math.cos(yaw) * leg.speed * span;
    } else {
      /* The facing is `(sin yaw, 0, cos yaw)`, integrated over a turning yaw. */
      stance.x += (leg.speed / leg.turn) * (Math.cos(yaw) - Math.cos(turned));
      stance.z += (leg.speed / leg.turn) * (Math.sin(turned) - Math.sin(yaw));
    }
    stance.yaw = turned;
  }
}
