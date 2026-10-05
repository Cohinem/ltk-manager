import { DRAG_MOTION } from "./enums";
import type { ChildSetModel, EmissionPeriod, EmitterModel, SystemModel, ValueCurve } from "./model";

/** A system with nothing in it, which is what an unreadable object draws as. */
export function emptySystem(entry: string | null): SystemModel {
  return {
    entry,
    name: null,
    emitters: [],
    transform: null,
    hudLayer: false,
    dragMotion: DRAG_MOTION.stepped,
    buildUpTime: 0,
  };
}

/**
 * The two lists address the same emitters, index for index.
 *
 * A pool's `emitter` column is a position in the concatenated list, so an index means the
 * same emitter only while its list, its place in that list and its name all hold.
 */
export function addressTheSame(
  held: readonly EmitterModel[],
  next: readonly EmitterModel[],
): boolean {
  if (held.length !== next.length) return false;

  return held.every(
    (own, at) =>
      own.simple === next[at].simple &&
      own.listIndex === next[at].listIndex &&
      own.name === next[at].name,
  );
}

/**
 * Emitter fields only the draw reads, which leave every pool, state and checkpoint of a run
 * as it was. A field missing here counts as simulated, so a new one costs a replay rather
 * than a stale checkpoint.
 */
const DRAWN_ONLY: ReadonlySet<string> = new Set<keyof EmitterModel>([
  "alphaRef",
  "backfaceCull",
  "blendMode",
  "color",
  "colorTexture",
  "customMaterial",
  "depthBias",
  "depthPushPull",
  "distortion",
  "erosion",
  "groundLayer",
  "hudLayer",
  "lookupOffsets",
  "lookupScales",
  "lookupX",
  "lookupY",
  "flipWinding",
  "mesh",
  "miscRenderFlags",
  "modulation",
  "multTexture",
  "palette",
  "pass",
  "pivotUp",
  "primitiveClass",
  "primitiveName",
  "projection",
  "quadType",
  "reflection",
  "renderPhaseOverride",
  "scale0",
  "soft",
  "stencilMode",
  "stencilRef",
  "texture",
  "uniformScale",
  "uvMode",
]);

/**
 * The two systems run the same simulation, differing at most in what the draw reads.
 *
 * A run's checkpoints stay valid across such an edit, so a seek after it restores one
 * rather than replaying from zero. Child systems are compared by the same rule.
 */
export function simulationEquals(current: SystemModel, next: SystemModel): boolean {
  if (
    current.dragMotion !== next.dragMotion ||
    current.hudLayer !== next.hudLayer ||
    current.buildUpTime !== next.buildUpTime ||
    !deepEquals(current.transform, next.transform) ||
    !addressTheSame(current.emitters, next.emitters)
  ) {
    return false;
  }

  return current.emitters.every((emitter, at) =>
    emitterSimulationEquals(emitter, next.emitters[at]),
  );
}

function emitterSimulationEquals(current: EmitterModel, next: EmitterModel): boolean {
  const fields = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const field of fields) {
    if (DRAWN_ONLY.has(field)) continue;

    const a = current[field as keyof EmitterModel];
    const b = next[field as keyof EmitterModel];
    if (field === "childSet") {
      if (!childSetSimulationEquals(current.childSet, next.childSet)) return false;
    } else if (!deepEquals(a, b)) {
      return false;
    }
  }
  return true;
}

function childSetSimulationEquals(
  current: ChildSetModel | null,
  next: ChildSetModel | null,
): boolean {
  if (current === null || next === null) return current === next;
  if (
    current.onDeath !== next.onDeath ||
    current.children.length !== next.children.length ||
    !deepEquals(current.bones, next.bones) ||
    !deepEquals(current.probability, next.probability) ||
    !deepEquals(current.inheritance, next.inheritance)
  ) {
    return false;
  }

  return current.children.every((child, at) => {
    const other = next.children[at];
    if (child === null || other === null) return child === other;
    return simulationEquals(child, other);
  });
}

/** Structural equality over the plain values, arrays and typed arrays a model is built of. */
function deepEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return false;
    const left = a as unknown as ArrayLike<number>;
    const right = b as unknown as ArrayLike<number>;
    if (left.length !== right.length) return false;
    for (let at = 0; at < left.length; at += 1) {
      if (!Object.is(left[at], right[at])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, at) => deepEquals(value, b[at]));
  }

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) =>
    deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** How long an emitter that never stops is scrubbed over, in seconds. */
const ENDLESS_SPAN = 5;

/** The narrowest and widest window a scrub spans, in seconds. */
const SPAN_RANGE = { least: 1, most: 60 };

/**
 * How long the system takes to play out, which is the window the scrub spans.
 *
 * Each emitter reaches from the system's start to its last birth plus the longest life a
 * particle of it takes. An emitter with no end emits for as long as the system is alive,
 * and a particle that never expires lives as long, so each contributes a fixed window
 * rather than an unbounded one.
 */
export function systemSpan(system: SystemModel): number {
  let span = SPAN_RANGE.least;
  for (const emitter of system.emitters) {
    if (emitter.disabled) continue;
    span = Math.max(span, lastBirth(emitter) + longestLife(emitter.particleLifetime));
  }
  return Math.min(span, SPAN_RANGE.most);
}

/** The system time the last particle of `emitter` is born at. */
function lastBirth(emitter: EmitterModel): number {
  const start = emitter.timeBeforeFirstEmission;
  if (emitter.singleParticle) return start;

  const end = emissionEnd(emitter);
  const window = emitter.period?.length == null ? (emitter.period?.active ?? null) : null;
  const open = end ?? start + ENDLESS_SPAN;
  return Math.max(window === null ? open : Math.min(open, window), 0);
}

/** The longest a particle born off `lifetime` lives, its tables at their largest. */
function longestLife(lifetime: ValueCurve): number {
  const most = curveMaximum(lifetime);
  if (most < 0) return ENDLESS_SPAN;

  let factor = 1;
  for (const table of lifetime.tables) {
    if (table.channel !== 0) continue;
    factor = table.keys.reduce((held, key) => Math.max(held, key.values[0] ?? 0), 0);
    if (table.keys.length === 0) factor = table.single;
  }
  return most * Math.max(factor, 0);
}

/**
 * How long the last particle plays on after a stop `stoppedAt` seconds into the run.
 *
 * The longest wait for [`stopWaitSeconds`] plus the linger any emitter grants, which is what
 * a stop leaves alive, so a run that ends in a stop reaches that far past it. The system's
 * age at the stop includes its build-up.
 */
export function lingerTail(system: SystemModel, stoppedAt: number): number {
  const age = stoppedAt + system.buildUpTime;
  let tail = 0;
  for (const emitter of system.emitters) {
    if (emitter.disabled) continue;
    const wait = Math.max(stopWaitSeconds(emitter) - age, 0);
    tail = Math.max(tail, wait + lingerSeconds(emitter));
  }
  return tail;
}

/** The seconds the engine caps a linger at, past the lifetime it adds them to. */
const LINGER_GRACE = 10;

/**
 * The system time emission ends at as the engine holds it, and null for an emitter with no end.
 *
 * `lifetime` as written, but for one rewrite the engine makes as it prepares a definition:
 * a complex `isSingleParticle` emitter writing no material overrides, whose `lifetime` is
 * unset or over ten seconds past `particleLifetime`, takes `particleLifetime` for it. The
 * time counts from the system's start, so such an emitter delayed past that value never
 * emits. A negative end never emits either.
 */
export function emissionEnd(emitter: EmitterModel): number | null {
  const held = emitter.lifetime;
  if (emitter.simple || !emitter.singleParticle || emitter.overridesMaterials) return held;

  const particle = curveMaximum(emitter.particleLifetime);
  if (particle === NEVER_EXPIRES) return held;
  return held === null || held > particle + LINGER_GRACE ? particle : held;
}

/** The `particleLifetime` the single-particle rewrite leaves `lifetime` alone at. */
const NEVER_EXPIRES = -1;

/** The emitter spawns nothing more at system time `now`, its end having passed. */
export function emissionEnded(emitter: EmitterModel, now: number): boolean {
  const end = emissionEnd(emitter);
  return end !== null && now >= end;
}

/**
 * The system age past which a stopped emitter counts as finished, which is `emitterLinger` capped.
 *
 * A complex emitter caps at its own end time plus ten seconds, uncapped for one that never
 * stops, and a simple one at ten. The age is the system's own and not the time since the
 * stop, so a stop issued past it grants no wait at all, and one issued before it leaves the
 * emitter spawning until then.
 */
export function stopWaitSeconds(emitter: EmitterModel): number {
  const lifetime = emitter.simple ? 0 : (emissionEnd(emitter) ?? Infinity);
  return Math.min(lifetime + LINGER_GRACE, Math.max(emitter.emitterLinger, 0));
}

/**
 * How long a finished emitter's particles are given, which is `particleLinger` capped.
 *
 * A complex emitter caps at the particle lifetime plus ten seconds and a simple one at
 * ten, the lifetime being its constant or the largest key of its curve.
 */
export function lingerSeconds(emitter: EmitterModel): number {
  const lifetime = emitter.simple ? 0 : curveMaximum(emitter.particleLifetime);
  return Math.min(lifetime + LINGER_GRACE, Math.max(emitter.particleLinger, 0));
}

/** The largest value a curve reaches, over its constant and every key of it. */
export function peak(value: ValueCurve): number {
  let most = Math.max(...value.constant, 0);
  for (const key of value.keys) most = Math.max(most, ...key.values);
  return most;
}

/**
 * The one number the engine reads a scalar value as where it needs one: the largest key of
 * its curve, and its constant where it has no curve.
 */
export function curveMaximum(value: ValueCurve): number {
  if (value.keys.length === 0) return value.constant[0] ?? 0;
  return value.keys.reduce((most, key) => Math.max(most, key.values[0] ?? 0), -Infinity);
}

/**
 * What `rotation0` is multiplied by, being authored per `1 / 60` second.
 *
 * `rotation0` alone. The UV rates are the same value classes and carry no scale, and
 * nothing else in the engine reads this constant.
 */
export const ROTATION_RATE = 60;

/** `period` and `timeActiveDuringPeriod` as read, and null for an emitter writing neither. */
export function emissionPeriod(
  length: number | null,
  active: number | null,
): EmissionPeriod | null {
  return length === null && active === null ? null : { length, active };
}

/**
 * The emitter may spawn at system time `now`: the time into the current cycle is below
 * `timeActiveDuringPeriod`.
 *
 * Both count from the system's start. A cycle of no length is no number, which the engine's
 * compare fails, so such an emitter never spawns.
 */
export function periodActive(period: EmissionPeriod | null, now: number): boolean {
  if (period === null || period.active === null) return true;

  const into = period.length === null ? now : now % period.length;
  return period.active > into;
}

/** The divisor under which the engine holds an emitter's phase at zero. */
const LEAST_PHASE_SPAN = 1e-6;

/**
 * Where an emitter stands in its own life at system time `now`, which every value sampled
 * on the emitter is read at.
 *
 * The time since `timeBeforeFirstEmission` over the least of the end time, `period` and
 * `timeActiveDuringPeriod` the emitter writes. It is neither clamped nor wrapped, so it
 * runs past one and does not restart each cycle, and it is zero for an emitter writing none
 * of the three.
 */
export function emitterPhase(emitter: EmitterModel, now: number): number {
  const span = Math.min(
    emissionEnd(emitter) ?? Infinity,
    emitter.period?.active ?? Infinity,
    emitter.period?.length ?? Infinity,
  );
  if (span === Infinity || Math.abs(span) <= LEAST_PHASE_SPAN) return 0;

  return (now - emitter.timeBeforeFirstEmission) / span;
}
