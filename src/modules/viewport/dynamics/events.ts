import type { ChainRig } from "./build";
import {
  advanceConformMask,
  blendConformTo,
  type ConformRig,
  resetConformMask,
  weighConform,
} from "./conform";
import { crossing, endsFirst, endsLast, NONE, type Span, spanOf, starts } from "./crossing";
import { advanceLock, buildLock, endLock, type LockRig, resetLock, startLock } from "./lock";
import { EPSILON } from "./math";
import type { OrientationRig } from "./orientation";
import type { SpringRig } from "./spring";
import type { DynamicsCues } from "./take";

/** How far a modifier is blended over the animation, and the change it is making. */
export interface Blend {
  weight: number;
  running: boolean;
  from: number;
  target: number;
  duration: number;
  elapsed: number;
}

/** The modifiers the events of a pass switch and blend. */
export interface EventTargets {
  readonly parents: Int32Array;
  readonly chains: readonly ChainRig[];
  readonly conforms: readonly ConformRig[];
  readonly springs: readonly SpringRig[];
  readonly orientations: readonly OrientationRig[];
}

/** The events of a pass, and where they have left each modifier. */
export interface PassEvents {
  /** One lock per lock event whose joint the skeleton holds. */
  readonly locks: readonly LockRig[];
  /** How far each chain is blended, in the order the rig holds them. */
  readonly chains: readonly Blend[];
  /** How far each orientation is blended, in the order the rig holds them. */
  readonly orientations: readonly Blend[];
  /** What each spring is weighed by, in the order the rig holds them. */
  readonly springs: readonly number[];
  /** Put every modifier back in its default state. */
  rest(): void;
  /**
   * Take the events the pass crossed from `before` to `now`, `before` excluded. `now` runs
   * past the end of the pass for a step over the seam.
   */
  cross(before: number, now: number): void;
  /** Put every modifier where a pass that ran from its start leaves it `pass` seconds in. */
  seek(pass: number): void;
}

/** A cue with its span inside the pass. */
interface Timed<Cue> {
  readonly cue: Cue;
  readonly span: Span;
}

/** The events of `cues` over a pass of `duration` seconds, for the modifiers of `rig`. */
export function createEvents(rig: EventTargets, duration: number, cues: DynamicsCues): PassEvents {
  const joints = rig.parents.length;
  const held = cues.locks.filter((cue) => cue.joint >= 0 && cue.joint < joints);
  const lockCues = timed(held, duration);
  const chainCues = timed(cues.chains, duration);
  const springCues = timed(cues.springs, duration);
  const conformCues = timed(cues.conforms, duration);
  const turnCues = timed(cues.orientations, duration);
  const moments = momentsOf([lockCues, chainCues, springCues, conformCues, turnCues].flat());

  const locks = lockCues.map(({ cue }) => buildLock(cue));
  const chains = rig.chains.map((chain) => restingBlend(chain.model.defaultOn));
  const orientations = rig.orientations.map((each) => restingBlend(each.model.defaultOn));
  const springs = rig.springs.map((spring) => restingWeight(spring.model.defaultOn));

  const rest = () => {
    for (const lock of locks) resetLock(lock);
    for (const conform of rig.conforms) resetConformMask(conform);

    chains.forEach((blend, at) =>
      Object.assign(blend, restingBlend(rig.chains[at].model.defaultOn)),
    );
    orientations.forEach((blend, at) =>
      Object.assign(blend, restingBlend(rig.orientations[at].model.defaultOn)),
    );
    rig.springs.forEach((spring, at) => {
      springs[at] = restingWeight(spring.model.defaultOn);
    });
  };

  const cross = (before: number, now: number) => {
    for (let at = 0; at < locks.length; at += 1) {
      const order = crossing(lockCues[at].span, before, now, duration);
      if (endsFirst(order)) endLock(locks[at]);
      if (starts(order)) startLock(locks[at]);
      if (endsLast(order)) endLock(locks[at]);
    }

    for (const { cue, span } of conformCues) {
      const order = crossing(span, before, now, duration);
      for (const conform of rig.conforms) {
        if (endsFirst(order)) blendConformTo(conform, conform.model.mask, cue.blendOut);
        if (starts(order) && conform.mask !== cue.mask) {
          blendConformTo(conform, cue.mask, cue.blendIn);
        }
        if (endsLast(order)) blendConformTo(conform, conform.model.mask, cue.blendOut);
      }
    }

    for (const { cue, span } of springCues) {
      const order = crossing(span, before, now, duration);
      if (order === NONE) continue;

      for (let at = 0; at < rig.springs.length; at += 1) {
        const { name, defaultOn } = rig.springs[at].model;
        if (cue.spring !== null && cue.spring !== name) continue;

        const resting = restingWeight(defaultOn);
        springs[at] = starts(order) && !endsLast(order) ? 1 - resting : resting;
      }
    }

    for (const { cue, span } of turnCues) {
      const order = crossing(span, before, now, duration);
      for (let at = 0; at < orientations.length; at += 1) {
        blendThrough(orientations[at], order, rig.orientations[at].model.defaultOn, cue);
      }
    }

    for (const { cue, span } of chainCues) {
      const order = crossing(span, before, now, duration);
      for (let at = 0; at < chains.length; at += 1) {
        blendThrough(chains[at], order, rig.chains[at].model.defaultOn, cue);
      }
    }
  };

  /* The time between two moments of a pass, which no step is taken over. */
  const elapse = (seconds: number) => {
    for (const lock of locks) advanceLock(lock, seconds);
    for (const blend of chains) advanceBlend(blend, seconds);
    for (const blend of orientations) advanceBlend(blend, seconds);

    for (const conform of rig.conforms) {
      advanceConformMask(conform, seconds);
      weighConform(conform);
    }
  };

  const seek = (pass: number) => {
    rest();
    for (const conform of rig.conforms) weighConform(conform);

    let before = -1;
    for (let at = 0; at < moments.length && moments[at] <= pass; at += 1) {
      const next = at + 1 < moments.length ? Math.min(moments[at + 1], pass) : pass;
      cross(before, moments[at]);
      elapse(next - moments[at]);
      before = moments[at];
    }
  };

  return { locks, chains, orientations, springs, rest, cross, seek };
}

/** Move `blend` on by `seconds`. */
export function advanceBlend(blend: Blend, seconds: number): void {
  if (!blend.running) return;

  blend.elapsed += seconds;
  if (blend.elapsed >= blend.duration) {
    blend.weight = blend.target;
    blend.running = false;
    return;
  }
  blend.weight = blend.from + (blend.target - blend.from) * (blend.elapsed / blend.duration);
}

/** Each of `cues` with its span inside a pass of `duration` seconds, less those that start past it. */
function timed<Cue extends { readonly at: number; readonly until: number | null }>(
  cues: readonly Cue[],
  duration: number,
): Timed<Cue>[] {
  return cues.flatMap((cue) => {
    const span = spanOf(cue.at, cue.until, duration);
    return span === null ? [] : [{ cue, span }];
  });
}

/** Where each of `cues` starts and ends, in order. */
function momentsOf(cues: readonly Timed<unknown>[]): number[] {
  return [...new Set(cues.flatMap(({ span }) => [span.at, span.until]))].sort((a, b) => a - b);
}

function restingWeight(defaultOn: boolean): number {
  return defaultOn ? 1 : 0;
}

function restingBlend(defaultOn: boolean): Blend {
  const weight = restingWeight(defaultOn);
  return {
    weight,
    running: false,
    from: weight,
    target: weight,
    duration: 0,
    elapsed: 0,
  };
}

/** `blend` taken through what a step crossed of an event that blends it off its default. */
function blendThrough(
  blend: Blend,
  order: number,
  defaultOn: boolean,
  cue: { readonly blendFrom: number; readonly blendTo: number },
): void {
  const resting = restingWeight(defaultOn);
  if (endsFirst(order)) startBlend(blend, resting, cue.blendTo);
  if (starts(order)) startBlend(blend, 1 - resting, cue.blendFrom);
  if (endsLast(order)) startBlend(blend, resting, cue.blendTo);
}

/** Start `blend` toward `target` over `duration` seconds, at once for no duration. */
function startBlend(blend: Blend, target: number, duration: number): void {
  blend.from = blend.weight;
  blend.target = target;
  blend.duration = duration;
  blend.elapsed = 0;
  blend.running = duration > EPSILON;
  if (!blend.running) blend.weight = target;
}
