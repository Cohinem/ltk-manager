import { DRAG_MOTION, type DragMotion, OFFSET_SYMMETRY } from "../model/enums";
import type { EmitterModel, LegacySimpleModel, UvLayer } from "../model/model";
import { emissionEnded, emitterPhase, periodActive, stopWaitSeconds } from "../model/systemModel";
import { analyticTerminal } from "../utils/analyticDrag";
import { turnInto } from "../utils/basis";
import type { Rng } from "../utils/Rng";
import { drawChannelsInto, drawCurve, sampleCurve, tableValue } from "../utils/sampleCurve";
import type { EmitterState, SystemStep } from "./integrate";
import { scalar } from "./particleRead";
import { FRAME_SLOTS, type Pool, spawn, UV, UV_LAYERS, uvAt } from "./pool";
import { birth, sampleShape } from "./spawnShape";

/** The share of the rate one step may spend, which is the engine's own burst cap. */
const BURST_SHARE = 0.33;

/** The most particles one step spawns from one emitter, whatever its rate. */
const MOST_PER_STEP = 1000;

/** What a spawn count is held in, which wraps a count past it. */
const COUNT_MASK = 0xffff;

/** Scratch the spawn shape writes one birth into, reused across every spawn. */
const BORN = birth();
const SURFACE_BIRTH = { position: new Float32Array(3), normal: new Float32Array(3) };

/** Scratch a trail's or a beam's tiling is drawn into, of which the pool keeps two. */
const TILED = new Float32Array(3);

/** Scratch a spawn's own position, turned into the step's world space to grow the odometer. */
const SPAWN_AT = new Float32Array(3);

/** Scratch one birth's base position is built in, before the shape's offset joins it. */
const BASE = new Float32Array(3);

/**
 * The particles one emitter owes this step, born with their birth values.
 *
 * Every time is the system's own, counted from its start: the emitter spawns once that
 * time reaches `timeBeforeFirstEmission`, until it reaches the end time, and while the
 * period is in its active part. The count is the time since the last spawn times the
 * rate, truncated, under the burst cap, and a spawn moves the last spawn to now, so what
 * the truncation drops is not carried. A step that spawns nothing leaves it, which is how
 * a slow rate still emits. A stopped system keeps spawning until its age passes
 * [`stopWaitSeconds`].
 *
 * The births of one step are spread evenly over it, in birth time and along the system's
 * travel. Each stores its position, velocity and acceleration in the emitter's own frame,
 * and the frame it was born in beside them.
 *
 * A particle's shared number is drawn first, or is the emitter's own under
 * `ParticlesShareRandomValue`. `particleLifetime` draws its own, and every channel of a
 * birth vector another.
 */
export function emit(
  pool: Pool,
  emitter: EmitterModel,
  index: number,
  state: EmitterState,
  step: SystemStep,
  rng: Rng,
  dragMotion: DragMotion,
): void {
  if (emitter.disabled || state.absent) return;
  if (emitter.singleParticle && state.emitted) return;

  const now = state.age;
  if (step.stopped && now > stopWaitSeconds(emitter)) return;
  if (now < emitter.timeBeforeFirstEmission || emissionEnded(emitter, now)) return;
  if (!periodActive(emitter.period, now)) return;

  const phase = emitterPhase(emitter, now);
  const pinned = step.pinned ?? null;
  const count = spawnCount(emitter, state, step, phase, rng);
  if (count <= 0) return;

  travel(state, step);
  const tiling = emitter.trail?.tiling ?? emitter.beam?.tiling ?? null;
  const surfaces = step.surfaces?.get(index);
  const draw = () => rng.unitFloat();
  if (emitter.sharedRandom && state.chance === null) state.chance = rng.unitFloat();

  for (let born = 0; born < count; born += 1) {
    /* Drawn even under a pin, so the stream every later draw reads is the unpinned run's. */
    const drawn = state.chance ?? rng.unitFloat();
    const shared = pinned ?? drawn;
    const share = (born + 1) / count;
    const at = spawn(pool, index, step.now - step.dt * (1 - share), 0, shared);
    if (at === null) break;

    const slot = at * 3;
    let lifetime = drawnLifetime(emitter, phase, rng, pinned);
    pool.frame.set(state.frame, at * FRAME_SLOTS);
    for (let axis = 0; axis < 3; axis += 1) {
      pool.anchor[slot + axis] =
        step.origin[axis] - step.moved[axis] * (1 - share) + state.offset[axis];
      BASE[axis] = emitter.emitterSpace ? 0 : state.position[axis];
    }

    drawChannelsInto(emitter.birthVelocity, phase, draw, pinned, pool.velocity, slot);
    drawChannelsInto(emitter.birthAcceleration, phase, draw, pinned, pool.birthAcceleration, slot);
    if (emitter.legacySimple === null) {
      drawChannelsInto(emitter.birthRotation0, phase, draw, pinned, pool.birthRotation, slot);
      drawChannelsInto(
        emitter.birthRotationalVelocity0,
        phase,
        draw,
        pinned,
        pool.angularVelocity,
        slot,
      );
      drawChannelsInto(emitter.birthScale0, phase, draw, pinned, pool.birthScale, slot);
    } else {
      bornSimple(pool, at, emitter.legacySimple, phase, shared);
    }
    drawChannelsInto(
      emitter.birthRotationalAcceleration,
      phase,
      draw,
      pinned,
      pool.angularAcceleration,
      slot,
    );
    drawChannelsInto(emitter.birthDrag, phase, draw, pinned, pool.birthDrag, slot);
    drawChannelsInto(emitter.birthOrbitalVelocity, phase, draw, pinned, pool.orbital, slot);
    drawChannelsInto(emitter.birthColor, phase, draw, pinned, pool.birthColor, at * 4);

    sampleShape(emitter.shape, rng, phase, pinned, BORN);
    lifetime = offsetLifetime(emitter, lifetime, BORN.raw);
    pool.lifetime[at] = lifetime;

    if (surfaces?.mesh?.sample(now, rng, SURFACE_BIRTH)) {
      for (let axis = 0; axis < 3; axis += 1) BASE[axis] += SURFACE_BIRTH.position[axis];
      if (emitter.emissionMesh?.useNormal) {
        alongNormal(pool.velocity, slot);
        alongNormal(pool.birthAcceleration, slot);
      }
    }
    if (surfaces?.surface?.sample(now, rng, SURFACE_BIRTH)) {
      for (let axis = 0; axis < 3; axis += 1) BASE[axis] += SURFACE_BIRTH.position[axis];
      if (emitter.emissionSurface?.useNormal) alongNormal(pool.velocity, slot);
    }

    /* The shape's turn is the last thing a birth takes, over the offset, the velocity and
       the acceleration alike, so it turns a surface's normal too. */
    if (BORN.turned) {
      turnInto(BORN.turn, pool.velocity, slot);
      turnInto(BORN.turn, pool.birthAcceleration, slot);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      pool.position[slot + axis] = BASE[axis] + BORN.offset[axis];
    }

    if (dragMotion === DRAG_MOTION.analytic) easeOut(pool, at);
    bornUv(pool, at, emitter, phase, shared, shared);

    pool.odometer[at] = state.travelled;
    if (tiling !== null) {
      drawChannelsInto(tiling, phase, draw, pinned, TILED, 0);
      pool.tiling[at * 2] = TILED[0];
      pool.tiling[at * 2 + 1] = TILED[1];
    }
  }

  state.emitted = true;
  state.lastSpawn = now;
}

/**
 * How many particles `emitter` spawns this step.
 *
 * A first emission that counts to zero is raised to one unless `HasVariableStartTime` is
 * set, and `isSingleParticle` makes it the rate itself, truncated and at least one. A
 * trail's `mMaxAddedPerFrame` caps the count last of all.
 */
function spawnCount(
  emitter: EmitterModel,
  state: EmitterState,
  step: SystemStep,
  phase: number,
  rng: Rng,
): number {
  const rate = rateOf(emitter, step, phase, rng);
  const length = emitter.period?.length ?? null;
  const cycleStart = length === null ? 0 : Math.trunc(state.age / length) * length;
  const since = Math.max(cycleStart, state.lastSpawn);

  let count = Math.min(
    Math.trunc((state.age - since) * rate) & COUNT_MASK,
    (Math.trunc(rate * BURST_SHARE) + 1) & COUNT_MASK,
  );
  if (!state.emitted) {
    if (count === 0 && !emitter.hasVariableStartTime) count = 1;
    if (emitter.singleParticle) count = Math.max(Math.trunc(rate) & COUNT_MASK, 1);
  }

  const most = emitter.trail?.maxAddedPerFrame ?? 0;
  if (most > 0 && count >= most) count = most;
  return Math.min(count, MOST_PER_STEP);
}

/**
 * The emitter's rate this step, in particles a second.
 *
 * `rateByVelocityFunction` replaces `rate` where the emitter writes one, by the speed the
 * whole system moved at over the step. A table on `rate` is read at a fresh draw each
 * step. The preview runs at Very High effects quality, which scales no `importance`.
 */
function rateOf(emitter: EmitterModel, step: SystemStep, phase: number, rng: Rng): number {
  const byVelocity = emitter.rateByVelocity;
  if (byVelocity !== null) {
    const speed = step.dt > 0 ? Math.hypot(...step.moved) / step.dt : 0;
    return Math.max(
      Math.min(emitter.maximumRateByVelocity, speed * byVelocity[0] + byVelocity[1]),
      0,
    );
  }

  let rate = scalar(sampleCurve(emitter.rate, phase));
  for (const table of emitter.rate.tables) {
    const drawn = rng.unitFloat();
    if (table.channel === 0) rate *= tableValue(table, step.pinned ?? drawn);
  }
  return Math.max(rate, 0);
}

/**
 * One particle's lifetime at birth: the curve at the emitter's phase, times its table at a
 * draw of its own. A negative lifetime never expires.
 */
function drawnLifetime(
  emitter: EmitterModel,
  phase: number,
  rng: Rng,
  pinned: number | null,
): number {
  let lifetime = scalar(sampleCurve(emitter.particleLifetime, phase));
  for (const table of emitter.particleLifetime.tables) {
    const drawn = rng.unitFloat();
    if (table.channel === 0) lifetime *= tableValue(table, pinned ?? drawn);
  }
  return lifetime < 0 ? Infinity : lifetime;
}

/**
 * `lifetime` after `offsetLifetimeScaling`: the seconds each unit of the raw shape offset
 * adds, never below zero, an axis read unsigned where `offsetLifeScalingSymmetryMode` names it.
 */
function offsetLifetime(emitter: EmitterModel, lifetime: number, raw: Float32Array): number {
  const scaling = emitter.offsetLifetimeScaling;
  if (scaling[0] === 0 && scaling[1] === 0 && scaling[2] === 0) return lifetime;

  const mode = emitter.offsetLifeSymmetry;
  const x = (mode & OFFSET_SYMMETRY.x) !== 0 ? Math.abs(raw[0]) : raw[0];
  const y = (mode & OFFSET_SYMMETRY.y) !== 0 ? Math.abs(raw[1]) : raw[1];
  const z = (mode & OFFSET_SYMMETRY.z) !== 0 ? Math.abs(raw[2]) : raw[2];
  return Math.max(lifetime + x * scaling[0] + y * scaling[1] + z * scaling[2], 0);
}

/** The vector at `at` pointed along the sampled surface's normal, its length kept. */
function alongNormal(vector: Float32Array, at: number): void {
  const length = Math.hypot(vector[at], vector[at + 1], vector[at + 2]);
  for (let axis = 0; axis < 3; axis += 1) vector[at + axis] = SURFACE_BIRTH.normal[axis] * length;
}

/**
 * A newborn's birth velocity traded for the displacement `UseCalculusForPhysics` eases out to.
 *
 * The stored velocity is cleared on every axis, so an axis with no birth drag takes no
 * motion from its birth velocity at all.
 */
function easeOut(pool: Pool, at: number): void {
  for (let slot = at * 3; slot < at * 3 + 3; slot += 1) {
    const terminal = analyticTerminal(pool.velocity[slot], pool.birthDrag[slot]);
    pool.dragTerminal[slot] = terminal;
    pool.dragOffset[slot] = terminal;
    pool.velocity[slot] = 0;
  }
}

/** The emitter's odometer moved on by this spawn's distance from the last. */
function travel(state: EmitterState, step: SystemStep): void {
  SPAWN_AT.set(state.position);
  turnInto(state.frame, SPAWN_AT, 0);
  const x = step.origin[0] + state.offset[0] + SPAWN_AT[0];
  const y = step.origin[1] + state.offset[1] + SPAWN_AT[1];
  const z = step.origin[2] + state.offset[2] + SPAWN_AT[2];

  if (state.spawnedAt === null) state.spawnedAt = [x, y, z];
  else {
    const from = state.spawnedAt;
    state.travelled += Math.hypot(x - from[0], y - from[1], z - from[2]);
    from[0] = x;
    from[1] = y;
    from[2] = z;
  }
}

/**
 * A simple emitter's birth values, one number each where a complex emitter draws three.
 *
 * The one size is drawn once and stands on every axis, `scaleBias` across and up, so a
 * table on it keeps the particle square. The roll and its rate land about the view
 * axis, which is the one a simple quad turns on.
 */
export function bornSimple(
  pool: Pool,
  at: number,
  legacy: LegacySimpleModel,
  t01: number,
  chance: number,
): void {
  const size = drawCurve(legacy.birthScale, t01, chance)[0] ?? 1;
  pool.birthScale[at * 3] = size * legacy.scaleBias[0];
  pool.birthScale[at * 3 + 1] = size * legacy.scaleBias[1];
  pool.birthScale[at * 3 + 2] = size;

  pool.birthRotation[at * 3 + 2] = drawCurve(legacy.birthRotation, t01, chance)[0] ?? 0;
  pool.rotation[at * 3 + 2] = pool.birthRotation[at * 3 + 2];
  pool.angularVelocity[at * 3 + 2] = drawCurve(legacy.birthRotationalVelocity, t01, chance)[0] ?? 0;
}

/**
 * Both layers' UV state at birth: the ramps' own numbers, and how far into its run the
 * book opens.
 *
 * Every table here is read at the particle's shared number, `chance`, and a random start
 * is that same number times the frame count, a fraction of a cell included, which `roll`
 * carries. The mult layer reads the base layer's book, so both layers open on the same
 * cell. A simple emitter plays its book at `frameRate` alone.
 */
export function bornUv(
  pool: Pool,
  at: number,
  emitter: EmitterModel,
  t01: number,
  roll: number,
  chance: number,
): void {
  for (let layer = 0; layer < UV_LAYERS; layer += 1) {
    const held: UvLayer | null = layer === 0 ? emitter.uv : emitter.multUv;
    if (held === null) continue;

    const slot = uvAt(at, layer);
    const offset = drawCurve(held.birthOffset, t01, chance);
    const rate = drawCurve(held.birthScrollRate, t01, chance);

    pool.uv[slot + UV.birthOffsetX] = offset[0] ?? 0;
    pool.uv[slot + UV.birthOffsetY] = offset[1] ?? 0;
    pool.uv[slot + UV.birthScrollX] = rate[0] ?? 0;
    pool.uv[slot + UV.birthScrollY] = rate[1] ?? 0;
    pool.uv[slot + UV.birthRotate] = scalar(drawCurve(held.birthRotateRate, t01, chance));

    const book = held.book;
    const own = emitter.simple ? 1 : scalar(drawCurve(book.birthRate, t01, chance));
    pool.uv[slot + UV.phase] = book.randomStart ? roll * Math.max(book.frames, 0) : 0;
    pool.uv[slot + UV.frameRate] = book.rate * own;
  }
}
