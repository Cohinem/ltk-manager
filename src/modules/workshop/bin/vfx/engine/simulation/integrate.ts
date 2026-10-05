import { DRAG_MOTION, LINGER_TYPE } from "../model/enums";
import type { EmitterModel, SystemModel, ValueCurve } from "../model/model";
import type { Point } from "../model/rig";
import {
  emissionEnd,
  emitterPhase,
  lingerSeconds,
  ROTATION_RATE,
  stopWaitSeconds,
} from "../model/systemModel";
import { analyticOffset } from "../utils/analyticDrag";
import { identityInto, multiplyInto, standingInto, turnInto } from "../utils/basis";
import type { Rng } from "../utils/Rng";
import { flickerInto, integratedInto, sampleCurve, sampleCurveInto } from "../utils/sampleCurve";
import type { SystemSurfaces } from "./emissionSurface";
import { emit } from "./emit";
import { applyFields, type NoiseClock, prepareFields, type SampledFields } from "./forceFields";
import { age01, orbitInto, sampled, sampleScalar } from "./particleRead";
import { FRAME_SLOTS, NOT_LINGERING, type Pool, retire } from "./pool";
import type { Step } from "./stepper";

/** The step under which the engine's closed-form drag moves nothing, in seconds. */
const LEAST_ANALYTIC_STEP = 1e-6;

/** Scratch the spawn frame's own override is stood and scaled in, once per step. */
const OVERRIDE = new Float32Array(FRAME_SLOTS);
const STOOD = new Float32Array(3);

/**
 * Scratch one particle's step is carried in: the velocity it keeps, the velocity it moves
 * at this step, that one before the fields acted, and where the particle stood.
 */
const KEPT = new Float32Array(3);
const MOVING = new Float32Array(3);
const PUSHED = new Float32Array(3);
const PLACE = new Float32Array(3);

/** Scratch each value read over a particle's life is sampled into. */
const OVER_LIFE = new Float32Array(3);

/** Scratch a particle's own matrix translation and its world velocity are built in. */
const PLACED = new Float32Array(3);
const ORBIT = new Float32Array(FRAME_SLOTS);
const TRAVEL = new Float32Array(3);

/** What every centre of a force field is placed from, the origin of the emitter's own frame. */
const FRAME_ORIGIN: Point = [0, 0, 0];

/** One step, and where the rig had the system's origin while it ran. */
export interface SystemStep extends Step {
  /** The emitters of this system that emit from a loaded mesh or surface, by index. */
  readonly surfaces?: SystemSurfaces;
  /** Where the system stands at the end of the step. */
  readonly origin: Point;
  /** How far the system travelled over the step. */
  readonly moved: Point;
  /** The system's orientation this step: the rig's facing as a basis, in the engine's space. */
  readonly yaw: Float32Array;
  /** The definition's own `transform`, the last factor of every particle's own matrix. */
  readonly world: World;
  /** The rig has soft-stopped the system, as the engine does. */
  readonly stopped: boolean;
  /** The number every birth reads its tables at in place of its own, while the reader pins one. */
  readonly pinned?: number | null;
}

/** The definition's `transform` as a particle takes it: a basis, and an offset after it. */
export interface World {
  readonly basis: Float32Array;
  readonly offset: Point;
  /**
   * The system is on the HUD layer, which multiplies no `transform` into a particle and
   * takes the translation as an offset of where the system stands.
   */
  readonly hud: boolean;
}

/** The transform of a system writing none, which a source standing alone reads. */
export const NO_TRANSFORM: World = {
  basis: identityInto(new Float32Array(FRAME_SLOTS)),
  offset: [0, 0, 0],
  hud: false,
};

/**
 * The system's `transform` as a basis and an offset.
 *
 * The file's rows are the basis and its last row the translation, so the basis here is
 * the upper block transposed. The identity and no offset for a system writing none, and
 * the identity under its translation for one on the HUD layer.
 */
export function worldOf(system: SystemModel): World {
  const basis = identityInto(new Float32Array(FRAME_SLOTS));
  const held = system.transform;
  if (held === null) return { basis, offset: [0, 0, 0], hud: system.hudLayer };

  const offset: Point = [held[12], held[13], held[14]];
  if (system.hudLayer) return { basis, offset, hud: true };

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      basis[row * 3 + column] = held[column * 4 + row];
    }
  }
  return { basis, offset, hud: false };
}

/** What an emitter carries between steps, which the particle pool has nowhere to hold. */
export interface EmitterState {
  /** The system's own time, in seconds since it started, its build-up included. */
  age: number;
  /** The emitter has emitted at least once. */
  emitted: boolean;
  /** The system time of the last spawn, which the next count runs from, and zero before any. */
  lastSpawn: number;
  /** The roll of `ChanceToNotExist` left the emitter out of this run. */
  readonly absent: boolean;
  /** Where `EmitterPosition` stands this step, which a birth starts from. */
  position: [number, number, number];
  /** When the emitter's linger first acted, and null before it has. */
  finishedAt: number | null;
  /**
   * The one shared number a `ParticlesShareRandomValue` emitter hands every particle.
   *
   * The engine writes it in its restart blocks alone, so it is drawn at the first
   * emission of a run and null until then.
   */
  chance: number | null;
  /**
   * How far the spawn point has travelled since the first spawn, the odometer the emitter
   * keeps.
   */
  travelled: number;
  /** Where the last spawn was, which the next adds its distance from, and null before any. */
  spawnedAt: [number, number, number] | null;
  /** The spawn frame's basis this step, which [`frameInto`] rebuilds before a batch. */
  readonly frame: Float32Array;
  /** `translationOverride` under the system's orientation, which every birth's anchor takes. */
  readonly offset: Float32Array;
  /** Each noise field's impulse clock, in the order the emitter's collection lists them. */
  readonly noise: NoiseClock[];
}

/**
 * One state per emitter, at the system's start.
 *
 * `rng` rolls each complex emitter's `ChanceToNotExist`, which the engine does once as a
 * system spawns. An emitter writing no chance draws nothing, and no stream leaves every
 * emitter in.
 */
export function createEmitterStates(emitters: readonly EmitterModel[], rng?: Rng): EmitterState[] {
  return emitters.map((emitter) => {
    const position = sampleCurve(emitter.emitterPosition, emitterPhase(emitter, 0));
    const chance = emitter.chanceToNotExist;
    return {
      age: 0,
      emitted: false,
      lastSpawn: 0,
      absent: chance > 0 && rng !== undefined && chance > rng.unitFloat(),
      position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0],
      finishedAt: null,
      chance: null,
      travelled: 0,
      spawnedAt: null,
      frame: new Float32Array(FRAME_SLOTS),
      offset: new Float32Array(3),
      noise: [],
    };
  });
}

/** One state per emitter standing where `states` stand, which a checkpoint holds. */
export function copyEmitterStates(states: readonly EmitterState[]): EmitterState[] {
  return states.map((state) => ({
    ...state,
    position: [...state.position],
    spawnedAt: state.spawnedAt === null ? null : [...state.spawnedAt],
    frame: state.frame.slice(),
    offset: state.offset.slice(),
    noise: state.noise.map((clock) => ({ ...clock })),
  }));
}

/**
 * The emitter's own frame as a basis, into `out`: `rotationOverride` stood at, each
 * column scaled by its axis of `scaleOverride`, so the scale acts first.
 */
function overrideInto(emitter: EmitterModel, out: Float32Array): Float32Array {
  STOOD.set(emitter.rotationOverride);
  standingInto(STOOD, 0, 0, out);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      out[row * 3 + column] *= emitter.scaleOverride[column];
    }
  }
  return out;
}

/**
 * The spawn frame for this step, into the state.
 *
 * The emitter's own frame under the system's orientation, which `isLocalOrientation`
 * switches in. `translationOverride` is neither scaled nor turned by that frame, and takes
 * the orientation alone.
 */
function frameInto(emitter: EmitterModel, state: EmitterState, step: SystemStep): void {
  overrideInto(emitter, OVERRIDE);
  state.offset.set(emitter.translationOverride);
  if (!emitter.localOrientation) {
    state.frame.set(OVERRIDE);
    return;
  }

  multiplyInto(step.yaw, OVERRIDE, state.frame);
  turnInto(step.yaw, state.offset, 0);
}

/**
 * One step of a system: each emitter's spawns, its linger, then every live particle moved.
 *
 * The engine spawns before it updates, and moves a particle born during the step by no
 * time at all, so a newborn stands where it was placed with its matrix built.
 */
export function stepEmitters(
  pool: Pool,
  system: SystemModel,
  step: SystemStep,
  rng: Rng,
  state: EmitterState[],
): void {
  const emitters = system.emitters;
  for (let index = 0; index < emitters.length; index += 1) {
    const emitter = emitters[index];
    const own = state[index];
    own.age += step.dt;
    frameInto(emitter, own, step);

    const stood = sampled(emitter.emitterPosition, emitterPhase(emitter, own.age));
    for (let axis = 0; axis < 3; axis += 1) own.position[axis] = stood[axis];
  }

  for (let index = 0; index < emitters.length; index += 1) {
    emit(pool, emitters[index], index, state[index], step, rng, system.dragMotion);
  }
  for (let index = 0; index < emitters.length; index += 1) {
    settle(pool, emitters[index], index, state[index], step);
  }

  const crossed = emitters.some((emitter) => emitter.fields !== null)
    ? emitters.map((emitter, index) => fieldsOf(emitter, state[index], step))
    : NO_FIELDS;
  integrate(pool, system, state, step, crossed);
}

/** What a system none of whose emitters names a field collection reads for every one. */
const NO_FIELDS: readonly (SampledFields | null)[] = [];

/**
 * `emitter`'s force fields as this step reads them, and null for an emitter crossing none.
 *
 * A field acts in the emitter's own frame, on the position the integrator holds, so its
 * centre is its `Position` from that frame's origin and it never sees `EmitterPosition`
 * under `IsEmitterSpace`. Its values are read at the emitter's phase.
 */
function fieldsOf(
  emitter: EmitterModel,
  state: EmitterState,
  step: SystemStep,
): SampledFields | null {
  if (emitter.fields === null) return null;

  return prepareFields(
    emitter.fields,
    emitterPhase(emitter, state.age),
    step.now,
    { origin: FRAME_ORIGIN, orientation: emitter.localOrientation ? step.yaw : null },
    state.noise,
  );
}

/**
 * `fields` acting on the particle at `at`, over the velocity it moves at this step in
 * `MOVING`, and what they change kept in the one it carries on with in `KEPT`.
 */
function pushInto(fields: SampledFields, pool: Pool, at: number, dt: number): void {
  PUSHED.set(MOVING);
  for (let axis = 0; axis < 3; axis += 1) PLACE[axis] = pool.position[at * 3 + axis];
  applyFields(fields, MOVING, PLACE, pool.serial[at], dt);
  for (let axis = 0; axis < 3; axis += 1) KEPT[axis] += MOVING[axis] - PUSHED[axis];
}

/**
 * The linger policy for one emitter this step.
 *
 * An emitter is finished once the system's time passes its end, or, under a stop, passes
 * [`stopWaitSeconds`]. A complex single-particle emitter writing no material overrides is
 * finished from the step after its burst. `kFixedLifetimeAfterEmitterStops` acts on a
 * finished emitter stopped or not, and the two other kinds under a stop alone.
 *
 * The fixed kinds rewrite each live particle's lifetime once, to its age plus the linger.
 * The max kind cuts each lifetime to the linger at most on every step, which is all a
 * simple emitter does whatever its kind. A kind past the three changes nothing.
 */
function settle(
  pool: Pool,
  emitter: EmitterModel,
  index: number,
  state: EmitterState,
  step: SystemStep,
): void {
  const kind = emitter.simple ? LINGER_TYPE.maxLifetimeAfterEmitterDies : emitter.lingerType;
  if (kind === LINGER_TYPE.none) return;
  if (!step.stopped && kind !== LINGER_TYPE.fixedLifetimeAfterEmitterStops) return;
  if (!finished(emitter, state, step)) return;

  const capped = kind === LINGER_TYPE.maxLifetimeAfterEmitterDies;
  if (!capped && state.finishedAt !== null) return;
  state.finishedAt ??= step.now;

  const seconds = lingerSeconds(emitter);
  for (let at = 0; at < pool.count; at += 1) {
    if (pool.emitter[at] !== index) continue;
    if (pool.lingerFrom[at] === NOT_LINGERING) pool.lingerFrom[at] = state.finishedAt;
    pool.lifetime[at] = capped
      ? Math.min(pool.lifetime[at], seconds)
      : step.now - pool.birthTime[at] + seconds;
  }
}

/** The emitter counts as finished at this step, which is what its linger waits on. */
function finished(emitter: EmitterModel, state: EmitterState, step: SystemStep): boolean {
  if (!emitter.simple && emitter.singleParticle && !emitter.overridesMaterials && state.emitted) {
    /* The burst's own step is not finished yet, which the stamp of the last spawn tells. */
    if (state.lastSpawn < state.age) return true;
  }
  if (step.stopped) return state.age > stopWaitSeconds(emitter);

  const end = emissionEnd(emitter);
  return end !== null && state.age > end;
}

/** `value` at `through`, or the linger's own in its place, into the over-life scratch. */
function overLife(
  value: ValueCurve,
  linger: ValueCurve | null | undefined,
  through: number,
  serial: number,
  now: number,
): Float32Array {
  const read = linger ?? value;
  OVER_LIFE.fill(0);
  sampleCurveInto(read, through, OVER_LIFE, 0);
  flickerInto(read, serial, now, OVER_LIFE, 0);
  return OVER_LIFE;
}

/**
 * Every live particle moved through one step, and the ones past their lifetime retired.
 *
 * Positions, velocities and accelerations are in the frame a particle was born in. The
 * stored velocity gains the birth acceleration plus `acceleration`. The step's velocity is
 * that plus `velocity`, which is never stored. Drag, the birth drag plus `drag`, damps the
 * step's velocity on each axis and cannot turn it round, and what it takes comes off the
 * stored velocity too. Force fields act next, and what they change is kept. The position
 * then moves by the step's velocity. Every value named without `birth` is read at the
 * particle's own age, a lingering particle reading the linger's replacement where the
 * emitter switches one in.
 *
 * Under `UseCalculusForPhysics` the closed form of `analyticDrag.ts` takes the stepped
 * drag's place, off the birth drag alone, and the stored velocity is left as it is.
 *
 * The spin is rebuilt from the age rather than stepped, and the particle's matrix
 * translation after it: the position, `EmitterPosition` under `IsEmitterSpace`, the
 * system's current orientation under `particleIsLocalOrientation`, the orbit, then the
 * definition's `transform`. `bindWeight` adds its share of the system's travel in the world.
 */
function integrate(
  pool: Pool,
  system: SystemModel,
  states: readonly EmitterState[],
  step: SystemStep,
  fields: readonly (SampledFields | null)[],
): void {
  const analytic = system.dragMotion === DRAG_MOTION.analytic;
  for (let at = pool.count - 1; at >= 0; at -= 1) {
    const age = step.now - pool.birthTime[at];
    if (age >= pool.lifetime[at]) {
      retire(pool, at);
      continue;
    }

    const index = pool.emitter[at];
    const emitter = system.emitters[index];
    if (emitter === undefined) continue;

    const dt = pool.fresh[at] === 1 ? 0 : step.dt;
    const through = age01(pool, at, step.now);
    const serial = pool.serial[at];
    const linger = pool.lingerFrom[at] === NOT_LINGERING ? null : emitter.linger;
    const slot = at * 3;

    const pushed = overLife(emitter.acceleration, linger?.acceleration, through, serial, step.now);
    for (let axis = 0; axis < 3; axis += 1) {
      KEPT[axis] =
        pool.velocity[slot + axis] + (pool.birthAcceleration[slot + axis] + pushed[axis]) * dt;
    }
    const carried = overLife(emitter.velocity, linger?.velocity, through, serial, step.now);
    for (let axis = 0; axis < 3; axis += 1) MOVING[axis] = KEPT[axis] + carried[axis];

    const damped = overLife(emitter.drag, linger?.drag, through, serial, step.now);
    for (let axis = 0; axis < 3; axis += 1) damped[axis] += pool.birthDrag[slot + axis];
    if (damped[0] !== 0 || damped[1] !== 0 || damped[2] !== 0) {
      if (analytic) easeInto(pool, slot, age, dt);
      else dragInto(damped, dt);
    }

    const crossed = fields[index] ?? null;
    if (crossed !== null) pushInto(crossed, pool, at, dt);

    for (let axis = 0; axis < 3; axis += 1) {
      pool.velocity[slot + axis] = KEPT[axis];
      pool.position[slot + axis] += MOVING[axis] * dt;
    }

    turn(pool, at, emitter, age, through);
    place(pool, at, emitter, states[index], step, age, dt);
    carry(pool, at, emitter, step, through, dt);
    pool.fresh[at] = 0;
  }
}

/**
 * The stepped drag over `MOVING`, `drag` a second on each axis, never past a stop, and
 * what it takes off the step's velocity taken off the kept one as well.
 */
function dragInto(drag: Float32Array, dt: number): void {
  for (let axis = 0; axis < 3; axis += 1) {
    const moving = MOVING[axis];
    let change = -drag[axis] * moving * dt;
    if ((moving + change) * moving < 0) change = -moving;
    MOVING[axis] += change;
    KEPT[axis] += change;
  }
}

/**
 * The closed-form drag's share of the step in `MOVING`: what each axis eased through
 * since the last step, as a velocity. A step of no length eases nothing.
 */
function easeInto(pool: Pool, slot: number, age: number, dt: number): void {
  if (Math.abs(dt) <= LEAST_ANALYTIC_STEP) return;

  for (let axis = 0; axis < 3; axis += 1) {
    /* An axis with no birth drag has nothing to ease to, and `exp` of a negative one overflows. */
    const drag = pool.birthDrag[slot + axis];
    if (!(drag > 0)) continue;

    const offset = analyticOffset(pool.dragTerminal[slot + axis], drag, age);
    MOVING[axis] += (pool.dragOffset[slot + axis] - offset) / dt;
    pool.dragOffset[slot + axis] = offset;
  }
}

/**
 * The euler degrees one particle stands at, off its birth values and its age.
 *
 * The birth angle, the birth rate times the age and half the birth acceleration times the
 * age squared turn every particle. `rotation0` joins them under `isRotationEnabled` on a
 * particle that expires, as its integral over the age times [`ROTATION_RATE`], and a
 * lingering particle reads `LingerRotation` in its place where the emitter switches it in.
 *
 * A simple emitter turns in its quad's plane alone: its birth angle and rate, or `rotation`
 * in their place under `isRotationEnabled`.
 */
function turn(pool: Pool, at: number, emitter: EmitterModel, age: number, through: number): void {
  const slot = at * 3;
  for (let axis = 0; axis < 3; axis += 1) {
    pool.rotation[slot + axis] =
      pool.birthRotation[slot + axis] +
      age * (pool.angularVelocity[slot + axis] + 0.5 * age * pool.angularAcceleration[slot + axis]);
  }
  if (!emitter.rotationEnabled) return;

  const legacy = emitter.legacySimple;
  if (legacy !== null) {
    pool.rotation[slot + 2] = sampleScalar(legacy.rotation, through);
    return;
  }

  const lifetime = pool.lifetime[at];
  if (!Number.isFinite(lifetime)) return;

  const lingering = pool.lingerFrom[at] !== NOT_LINGERING;
  OVER_LIFE.fill(0);
  if (lingering && emitter.linger?.rotation) {
    sampleCurveInto(emitter.linger.rotation, through, OVER_LIFE, 0);
  } else {
    integratedInto(emitter.rotation0, through, 1, OVER_LIFE, 0);
  }
  for (let axis = 0; axis < 3; axis += 1) {
    pool.rotation[slot + axis] += OVER_LIFE[axis] * ROTATION_RATE * lifetime;
  }
}

/**
 * One particle's matrix translation, into `placed`, and how fast it moved, into `drift`.
 *
 * The orbit turns the particle about the origin of the emitter's own frame, by
 * `birthOrbitalVelocity` times the age in radians, after its translation is set, and the
 * definition's `transform` is the last factor.
 */
function place(
  pool: Pool,
  at: number,
  emitter: EmitterModel,
  state: EmitterState,
  step: SystemStep,
  age: number,
  dt: number,
): void {
  const slot = at * 3;
  for (let axis = 0; axis < 3; axis += 1) {
    PLACED[axis] = pool.position[slot + axis] + (emitter.emitterSpace ? state.position[axis] : 0);
  }
  if (emitter.particleLocalOrientation) turnInto(step.yaw, PLACED, 0);
  if (orbitInto(pool, at, age, ORBIT)) turnInto(ORBIT, PLACED, 0);
  if (!step.world.hud) {
    turnInto(step.world.basis, PLACED, 0);
    for (let axis = 0; axis < 3; axis += 1) PLACED[axis] += step.world.offset[axis];
  }

  for (let axis = 0; axis < 3; axis += 1) {
    pool.drift[slot + axis] = dt > 0 ? (PLACED[axis] - pool.placed[slot + axis]) / dt : 0;
    pool.placed[slot + axis] = PLACED[axis];
  }
}

/**
 * One particle's share of the system's travel, and its velocity in the world.
 *
 * `bindWeight`, read at the particle's age, adds that share of the step's travel to what
 * the particle has been carried by so far. The world velocity is the matrix's own through
 * the frame the particle was born in, which a particle of its own orientation skips, plus
 * that share of the system's velocity.
 */
function carry(
  pool: Pool,
  at: number,
  emitter: EmitterModel,
  step: SystemStep,
  through: number,
  dt: number,
): void {
  const slot = at * 3;
  for (let axis = 0; axis < 3; axis += 1) TRAVEL[axis] = pool.drift[slot + axis];
  if (!emitter.particleLocalOrientation) turnInto(pool.frame, TRAVEL, 0, at * FRAME_SLOTS);

  const weight = dt > 0 ? sampleScalar(emitter.bindWeight, through) : 0;
  for (let axis = 0; axis < 3; axis += 1) {
    if (weight > 0) {
      pool.bound[slot + axis] += weight * step.moved[axis];
      TRAVEL[axis] += (weight * step.moved[axis]) / dt;
    }
    pool.travel[slot + axis] = TRAVEL[axis];
  }
}
