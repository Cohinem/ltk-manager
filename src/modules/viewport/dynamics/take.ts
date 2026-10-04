import type { SkeletonModel } from "../assets/parsing/skeletonBuffer";
import { buildChain, type ChainRig, resetChain } from "./build";
import { stepChain, writeChainInto } from "./chain";
import {
  advanceConformMask,
  buildConform,
  type ConformRig,
  resetConform,
  stepConformInto,
} from "./conform";
import { advanceBlend, createEvents } from "./events";
import { applyLockInto, type LockCue } from "./lock";
import { EPSILON, folded, slerpInto } from "./math";
import { type DynamicsModel, SOLVER_SETTINGS, type SolverSettings } from "./model";
import { type Motion, passSeconds } from "./motion";
import { applyOrientationInto, buildOrientation, type OrientationRig } from "./orientation";
import {
  applySpringInto,
  buildSpring,
  resetSpring,
  type SpringRig,
  springRests,
  stepSpring,
} from "./spring";
import {
  composeWorldInto,
  createRoot,
  createWorldPose,
  LOCAL_FLOATS,
  parentsFirst,
  type RootTransform,
} from "./world";

/** The floats a take keeps per joint and frame: a translation and a rotation. */
export const TAKE_FLOATS = 7;

/** The passes a bake steps before the one it records, so the pass starts where it ends. */
export const DEFAULT_WARM_UP = 2;

/** The frame rates a bake steps at, since the game steps a chain once per frame. */
export const SIMULATED_RATES = [30, 60, 144, 240] as const;

export const DEFAULT_RATE = 60;

/**
 * One pass of a simulated pose, baked: the local transform of every joint a modifier
 * moves, per frame.
 *
 * "A simulated pose is a baked pass" in docs/plans/pose-dynamics-preview.md.
 */
export interface Take {
  readonly frames: number;
  /** Seconds the pass lasts. */
  readonly duration: number;
  /** The joints the take holds, by slot. */
  readonly slots: Int32Array;
  /** `frames` by `slots` by `TAKE_FLOATS`. */
  readonly locals: Float32Array;
}

/** A dynamics chain blend event of the pass, in seconds of the pass. */
export interface ChainCue {
  readonly at: number;
  /** Where the event ends, and null to hold to the end of the pass. */
  readonly until: number | null;
  /** Seconds the change away from the default takes. */
  readonly blendFrom: number;
  /** Seconds the change back takes. */
  readonly blendTo: number;
}

/** A spring event of the pass, in seconds of the pass. */
export interface SpringCue {
  readonly at: number;
  readonly until: number | null;
  /** The spring's `name` hash, and null for every spring. */
  readonly spring: string | null;
}

/** A conform event of the pass, in seconds of the pass, which every conform of the skin takes. */
export interface ConformCue {
  readonly at: number;
  readonly until: number | null;
  /** The event's mask as weights by slot, and null for an event naming none. */
  readonly mask: readonly number[] | null;
  /** Seconds the change to the event's mask takes. */
  readonly blendIn: number;
  /** Seconds the change back to each conform's own mask takes. */
  readonly blendOut: number;
}

/** A joint orientation event of the pass that blends, which every orientation of the skin takes. */
export interface OrientationCue {
  readonly at: number;
  readonly until: number | null;
  /** Seconds the change away from the default takes. */
  readonly blendFrom: number;
  /** Seconds the change back takes. */
  readonly blendTo: number;
}

/** The blend events of a pass. */
export interface DynamicsCues {
  readonly chains: readonly ChainCue[];
  readonly springs: readonly SpringCue[];
  readonly conforms: readonly ConformCue[];
  readonly locks: readonly LockCue[];
  readonly orientations: readonly OrientationCue[];
}

export const NO_CUES: DynamicsCues = {
  chains: [],
  springs: [],
  conforms: [],
  locks: [],
  orientations: [],
};

/** Whether `cues` hold an event that moves a joint with no modifier of the skin behind it. */
export function cuesMove(cues: DynamicsCues): boolean {
  return cues.locks.some((lock) => lock.joint >= 0);
}

/** Every modifier of a skin built against its skeleton, with the state a step moves. */
export interface DynamicsRig {
  readonly parents: Int32Array;
  /** The joints, every parent before its children. */
  readonly order: Int32Array;
  readonly scale: number;
  readonly chains: readonly ChainRig[];
  /** The conforms that hold a chain, in the order the skin lists them. */
  readonly conforms: readonly ConformRig[];
  /** The springs whose joint the skeleton holds, a joint nearer the root first. */
  readonly springs: readonly SpringRig[];
  /** The orientations that hold a joint and a source, in the order the skin lists them. */
  readonly orientations: readonly OrientationRig[];
  /** The joints a modifier of the skin writes, by slot, in slot order. */
  readonly slots: Int32Array;
}

/**
 * `model` built on `skeleton`, drawn at `scale`.
 *
 * `parents` is the pose's parent table, which breaks a cycle the file's own may hold.
 */
export function buildDynamics(
  model: DynamicsModel,
  skeleton: SkeletonModel,
  parents: Int32Array,
  scale: number,
  settings: SolverSettings = SOLVER_SETTINGS,
): DynamicsRig {
  const order = parentsFirst(parents);
  const rank = new Int32Array(parents.length);
  order.forEach((slot, at) => {
    rank[slot] = at;
  });

  const chains = model.chains.map((chain) => buildChain(chain, skeleton, parents, scale, settings));
  const springs = model.springs
    .filter((spring) => spring.joint >= 0 && spring.joint < parents.length)
    .map(buildSpring)
    .sort((a, b) => rank[a.model.joint] - rank[b.model.joint]);

  const conforms = model.conforms.filter((conform) => conform.joints.length > 0).map(buildConform);

  const orientations = model.orientations
    .filter((each) => each.joints.length > 0 && each.source !== null)
    .map(buildOrientation);

  const written = new Set<number>(springs.map((spring) => spring.model.joint));
  for (const orientation of orientations) {
    for (const slot of orientation.model.joints) written.add(slot);
  }

  for (const conform of model.conforms) {
    for (const slot of conform.joints) written.add(slot);
    for (const extra of conform.extraChains) {
      for (const slot of extra.joints) written.add(slot);
    }
  }

  for (const chain of chains) {
    for (let node = 0; node < chain.count; node += 1) {
      if (chain.simulated[node] === 1 && chain.pinned[node] === 0) written.add(chain.joint[node]);
    }
  }

  return {
    parents,
    order,
    scale,
    chains,
    conforms,
    springs,
    orientations,
    slots: Int32Array.from([...written].sort((a, b) => a - b)),
  };
}

/** Every modifier of a rig, stepped over a pose its caller fills. */
export interface Stepper {
  /**
   * The local transform of every joint. The caller fills it with the animated pose before
   * a step and reads the simulated pose from it after.
   */
  readonly locals: Float32Array;
  /** Where the unit stands, which the caller sets before a step. */
  readonly root: RootTransform;
  /** The joints a step writes, by slot. */
  readonly slots: Int32Array;
  /** Start every modifier and every event over. */
  reset(): void;
  /** Put the events where a pass leaves them `pass` seconds in, with no step. */
  seek(pass: number): void;
  /**
   * Step every modifier by `dt` seconds. `before` and `now` are the pass's own seconds at
   * the last step and at this one, which say what events the step crossed. `now` runs past
   * the end of the pass for a step over the seam.
   */
  step(before: number, now: number, dt: number): void;
  /** Step every modifier by `dt` seconds with every event held as it stands. */
  settle(dt: number): void;
}

/**
 * The modifiers of `rig` over a pass of `duration` seconds, with the events of `cues`.
 *
 * A bake steps it down a motion it supplies, and a live simulation under a unit a reader
 * moves. Both run the same step, so they differ in what moves the unit and in nothing else.
 */
export function createStepper(
  rig: DynamicsRig,
  duration: number,
  cues: DynamicsCues = NO_CUES,
): Stepper {
  const joints = rig.parents.length;
  const locals = new Float32Array(joints * LOCAL_FLOATS);
  const world = createWorldPose(joints);
  const root = createRoot(rig.scale);
  const compose = () => composeWorldInto(world, locals, rig.parents, rig.order, root);

  const events = createEvents(rig, duration, cues);
  const { locks } = events;
  const slots = Int32Array.from(
    new Set([...rig.slots, ...locks.map((lock) => lock.cue.joint)]),
  ).sort();
  /* 1 for a chain the last step left out, which stands back on the pose when it returns. */
  const idle = new Uint8Array(rig.chains.length);

  /* The game runs its modifiers by kind: a lock, a conform, a spring, an orientation,
     and every one of them before the chains, which it runs on the composed pose. */
  const run = (dt: number, eventDt: number) => {
    /* Whether a modifier has written `locals` since `world` was composed. */
    let stale = true;
    for (let at = 0; at < locks.length; at += 1) applyLockInto(locks[at], root, eventDt, locals);

    for (let at = 0; at < rig.conforms.length; at += 1) {
      compose();
      stepConformInto(rig.conforms[at], world, rig.parents, root, dt, locals);
      advanceConformMask(rig.conforms[at], eventDt);
    }

    for (let at = 0; at < rig.springs.length; at += 1) {
      const spring = rig.springs[at];
      const weight = events.springs[at];
      stepSpring(spring, root, dt);
      if (weight === 0 || springRests(spring)) continue;

      if (stale) compose();
      applySpringInto(spring, world, rig.parents, root, weight, locals);
      stale = true;
    }

    for (let at = 0; at < rig.orientations.length; at += 1) {
      const blend = events.orientations[at];
      const orientation = rig.orientations[at];
      if (blend.weight < EPSILON && !blend.running) continue;

      advanceBlend(blend, eventDt);
      if (stale) compose();
      /* An orientation composes the pose again after each joint it turns. */
      applyOrientationInto(orientation, world, rig.parents, root, blend.weight, locals, compose);
      stale = false;
    }

    for (let at = 0; at < rig.chains.length; at += 1) {
      const blend = events.chains[at];
      const chain = rig.chains[at];
      if (blend.weight < EPSILON && !blend.running) {
        idle[at] = 1;
        continue;
      }
      if (idle[at] === 1) resetChain(chain);
      idle[at] = 0;

      advanceBlend(blend, eventDt);
      if (stale) compose();
      stepChain(chain, world, root, dt);
      writeChainInto(chain, world, blend.weight, locals);
      stale = true;
    }
  };

  return {
    locals,
    root,
    slots,
    reset() {
      for (const chain of rig.chains) resetChain(chain);
      for (const spring of rig.springs) resetSpring(spring);
      for (const conform of rig.conforms) resetConform(conform);
      idle.fill(0);
      events.rest();
    },
    seek: events.seek,
    step(before, now, dt) {
      events.cross(before, now);
      run(dt, dt);
    },
    settle(dt) {
      run(dt, 0);
    },
  };
}

/** The animated pose a bake steps over, which a `Pose` is. */
export interface BakedPose {
  readonly duration: number;
  localsInto(time: number, out: Float32Array): Float32Array;
}

export interface BakeOptions {
  /** Steps a second. */
  readonly rate: number;
  /** Passes stepped before the recorded one. */
  readonly warmup: number;
  readonly cues?: DynamicsCues;
}

/** A bake in progress, which a caller runs a few milliseconds at a time. */
export interface Bake {
  /** How many steps the bake takes in all. */
  readonly steps: number;
  /**
   * Step until `deadline`, a `performance.now()` time, or to the end where it is absent.
   * Answers the take once the last step is done, and null before.
   */
  run(deadline?: number): Take | null;
}

/**
 * A bake of `rig` over `pose` carried by `motion`: the warm-up passes, then one recorded.
 *
 * The pass is cut into a whole number of steps, so the step is as near `1 / rate` as a
 * pass that ends on a step allows. Every rig starts over, which makes a bake a function
 * of what it is given and nothing else.
 */
export function createBake(
  rig: DynamicsRig,
  pose: BakedPose,
  motion: Motion,
  options: BakeOptions,
): Bake {
  const duration = passSeconds(pose.duration);
  const frames = Math.max(Math.round(duration * options.rate), 1);
  const dt = duration / frames;
  const warmup = Math.max(Math.floor(options.warmup), 0) * frames;
  const steps = warmup + frames;

  const stepper = createStepper(rig, duration, options.cues ?? NO_CUES);
  const { locals, root, slots } = stepper;
  const taken = new Float32Array(frames * slots.length * TAKE_FLOATS);
  stepper.reset();

  let step = 0;
  /* Where in the pass the last step ended, which is where the next one starts. */
  let reached = -dt;
  let take: Take | null = null;

  const advance = () => {
    const frame = step % frames;
    /* The step that closes a pass runs to its end, which is the start of the next. */
    const now = step > 0 && frame === 0 ? duration : frame * dt;

    pose.localsInto(step * dt, locals);
    motion.rootInto(step * dt, root);
    stepper.step(reached, now, dt);
    reached = frame * dt;

    if (step >= warmup) {
      const row = (step - warmup) * slots.length * TAKE_FLOATS;
      for (let at = 0; at < slots.length; at += 1) {
        const from = slots[at] * LOCAL_FLOATS;
        for (let float = 0; float < TAKE_FLOATS; float += 1) {
          taken[row + at * TAKE_FLOATS + float] = locals[from + float];
        }
      }
    }
    step += 1;
  };

  return {
    steps,
    run(deadline) {
      while (take === null) {
        if (step >= steps) {
          take = { frames, duration, slots, locals: taken };
          break;
        }

        advance();
        if (deadline !== undefined && performance.now() >= deadline) break;
      }
      return take;
    },
  };
}

/**
 * The joints `take` holds written over `locals` at `time`, between the two frames around it.
 *
 * The last frame runs into the first, since a pass baked to its steady state starts where
 * it ends.
 */
export function sampleTakeInto(take: Take, time: number, locals: Float32Array): Float32Array {
  const { frames, slots } = take;
  const at = (folded(time, take.duration) / take.duration) * frames;
  const from = Math.min(Math.floor(at), frames - 1);
  const to = (from + 1) % frames;
  const mix = at - from;
  const stride = slots.length * TAKE_FLOATS;

  for (let index = 0; index < slots.length; index += 1) {
    const a = from * stride + index * TAKE_FLOATS;
    const b = to * stride + index * TAKE_FLOATS;
    const out = slots[index] * LOCAL_FLOATS;
    for (let axis = 0; axis < 3; axis += 1) {
      locals[out + axis] =
        take.locals[a + axis] + (take.locals[b + axis] - take.locals[a + axis]) * mix;
    }

    slerpInto(TURN, 0, take.locals, a + 3, take.locals, b + 3, mix);
    for (let axis = 0; axis < 4; axis += 1) locals[out + 3 + axis] = TURN[axis];
  }
  return locals;
}

const TURN = new Float64Array(4);
