import { EPSILON, normalizeQuat, relativeInto, slerpInto } from "./math";
import { LOCAL_FLOATS, type RootTransform } from "./world";

/** A lock root orientation event of the pass, in seconds of the pass. */
export interface LockCue {
  readonly at: number;
  /** Where the event ends, and null to hold to the end of the pass. */
  readonly until: number | null;
  /** The joint held, by slot. */
  readonly joint: number;
  /** Seconds the joint takes to follow the unit again once the event ends. */
  readonly blendOut: number;
}

/** One lock and the state a step moves. */
export interface LockRig {
  readonly cue: LockCue;
  /** How the unit was turned when the lock took hold. */
  readonly captured: Float64Array;
  /** `armed` is started and takes the unit's rotation at its next step. */
  phase: "off" | "armed" | "held";
  /** Seconds since the event ended, and -1 while it runs. */
  ended: number;
}

export function buildLock(cue: LockCue): LockRig {
  return {
    cue,
    captured: Float64Array.of(0, 0, 0, 1),
    phase: "off",
    ended: -1,
  };
}

export function resetLock(rig: LockRig): void {
  rig.phase = "off";
  rig.ended = -1;
}

/** The event starts. A lock still easing out keeps the rotation it took. */
export function startLock(rig: LockRig): void {
  if (rig.phase === "off") rig.phase = "armed";
  rig.ended = -1;
}

/** The event ends, and the lock eases out from here. */
export function endLock(rig: LockRig): void {
  if (rig.phase !== "off") rig.ended = 0;
}

/** Move a lock that is easing out on by `seconds` with no step, and let go of one that is done. */
export function advanceLock(rig: LockRig, seconds: number): void {
  if (rig.phase === "off" || rig.ended < 0) return;

  rig.ended += seconds;
  if (rig.ended > rig.cue.blendOut) rig.phase = "off";
}

/**
 * One step of `rig`: its joint in `locals` is turned back by how far the unit has turned
 * since the lock took hold, so the joint keeps facing where it did.
 *
 * The step a lock takes hold on turns nothing, since the unit has not turned since. Once
 * the event ends the turn eases out in a line over the blend-out time.
 */
export function applyLockInto(
  rig: LockRig,
  root: RootTransform,
  dt: number,
  locals: Float32Array,
): void {
  if (rig.phase === "off") return;
  if (rig.phase === "armed") {
    rig.captured.set(root.rotation);
    rig.phase = "held";
    return;
  }

  let weight = 1;
  if (rig.ended >= 0) {
    if (rig.ended > rig.cue.blendOut) {
      rig.phase = "off";
      return;
    }
    if (rig.cue.blendOut > EPSILON) weight = 1 - rig.ended / rig.cue.blendOut;
    rig.ended += dt;
  }

  const at = rig.cue.joint * LOCAL_FLOATS + 3;
  relativeInto(TURNED, 0, rig.captured, 0, root.rotation, 0);
  slerpInto(TURNED, 0, IDENTITY, 0, TURNED, 0, weight);
  for (let axis = 0; axis < 4; axis += 1) LOCAL[axis] = locals[at + axis];
  relativeInto(LOCAL, 0, TURNED, 0, LOCAL, 0);
  normalizeQuat(LOCAL, 0);
  for (let axis = 0; axis < 4; axis += 1) locals[at + axis] = LOCAL[axis];
}

const IDENTITY = Float64Array.of(0, 0, 0, 1);
const TURNED = new Float64Array(4);
const LOCAL = new Float64Array(4);
