import { QUAD_TYPE } from "../model/enums";
import type { EmitterModel, ValueCurve } from "../model/model";
import type { Point } from "../model/rig";
import { emitterPhase, lingerSeconds } from "../model/systemModel";
import { alongInto, multiplyInto, standingInto, turnInto } from "../utils/basis";
import { flickerInto, integratedInto, sampleCurveInto } from "../utils/sampleCurve";
import type { EmitterState, World } from "./integrate";
import { FRAME_SLOTS, NOT_LINGERING, type Pool } from "./pool";

export { emitterPhase };

/** Scratch the orbit's own euler is built in, in the degrees a standing basis takes. */
const ORBITED = new Float32Array(3);

/** Scratch every curve of the step is sampled into, four channels being the widest. */
export const SAMPLED = new Float32Array(4);

/** `curve` at `t01` into `SAMPLED`, every channel the curve lacks standing at `fill`. */
export function sampled(curve: ValueCurve, t01: number, fill = 0): Float32Array {
  SAMPLED.fill(fill);
  sampleCurveInto(curve, t01, SAMPLED, 0);
  return SAMPLED;
}

/** The first channel of `curve` at `t01`, and `fill` for a curve carrying none. */
export function sampleScalar(curve: ValueCurve, t01: number, fill = 0): number {
  return sampled(curve, t01, fill)[0];
}

/** What a radian is worth in degrees, the orbital channel being authored in radians. */
const DEGREES_PER_RADIAN = 180 / Math.PI;

/** What a draw path knows about the frame it is on, which its per-particle reads take. */
export interface DrawFrame {
  /** The emitter the frame is read for. */
  readonly emitter: EmitterModel;
  /** The simulation's own clock, in seconds since the system started. */
  readonly now: number;
  /** Where the emitter stands in its own life, which its emitter-keyed curves are read at. */
  readonly phase: number;
  /** Where the rig has the system. */
  readonly origin: Point;
  /** How the rig turns the system now, which a particle of its own orientation stands on. */
  readonly orientation: Float32Array;
  /** The definition's own `transform`, the last factor of a particle's own matrix. */
  readonly world: World;
}

/**
 * A pool a draw reads, and the clock and placement its particles are read against.
 *
 * The driver is the source of the system the viewport opened, and each live child set is
 * a source of its own, so a draw walks every source of its definition.
 */
export interface Source {
  readonly pool: Pool;
  /** The simulation's own clock, in seconds since the viewport's system started. */
  readonly time: number;
  /** Seconds into this system's own run, which its emitters' phase is read at. */
  readonly elapsed: number;
  readonly origin: Point;
  /** Where the system aims, which a beam reaches for. */
  readonly target: Point;
  /** The system's orientation now, without the definition's own `transform`. */
  readonly orientation: Float32Array;
  /** The definition's own `transform`. */
  readonly world: World;
}

/** What `source` stands at this moment, for a draw of `emitter`. */
export function frameOf(source: Source, emitter: EmitterModel): DrawFrame {
  return {
    emitter,
    now: source.time,
    phase: emitterPhase(emitter, source.elapsed),
    origin: source.origin,
    orientation: source.orientation,
    world: source.world,
  };
}

/** Where one particle draws, of which a draw path keeps one. */
export interface DrawnPlace {
  /** The drawn position, in the engine's space. */
  readonly place: Float32Array;
}

/** The scratch [`drawnPlaceInto`] writes, one per draw path. */
export function drawnPlace(): DrawnPlace {
  return { place: new Float32Array(3) };
}

/** The primitive kinds whose scale `isUniformScale` reaches: the quads and the meshes. */
const UNIFORMLY_SCALED: ReadonlySet<number | null> = new Set([
  QUAD_TYPE.cameraQuad,
  QUAD_TYPE.cameraUnitQuad,
  QUAD_TYPE.arbitraryQuad,
  QUAD_TYPE.mesh,
  QUAD_TYPE.attachedMesh,
]);

/**
 * The scale and colour a particle draws at, into the caller's own scratch.
 *
 * Each is the birth value times the curve rather than the curve alone, the two passes the
 * engine runs after the integrator, and the colour takes `modulationFactor` on top. A
 * lingering particle reads `LingerScale` and `SeparateLingerColor` against the linger's own
 * progress instead, where its emitter switches them in. A table on either curve is read at
 * a fresh draw each step, so it flickers.
 */
export function appearance(
  pool: Pool,
  index: number,
  emitter: EmitterModel,
  now: number,
  out: { scale: Float32Array; color: Float32Array },
): void {
  const through = age01(pool, index, now);
  const linger = pool.lingerFrom[index] === NOT_LINGERING ? null : emitter.linger;
  const l01 = linger === null ? 0 : linger01(pool, index, emitter, now);
  const serial = pool.serial[index];

  /* Both factors stand at one before the curve, because `sampleCurveInto` writes only the
     channels the curve carries and the scratch is the caller's own across particles. */
  out.scale.fill(1, 0, 3);
  out.color.fill(1, 0, 4);

  if (linger?.scale) sampleCurveInto(linger.scale, l01, out.scale, 0);
  else if (emitter.legacySimple !== null) {
    out.scale.fill(sampleScalar(emitter.legacySimple.scale, through, 1), 0, 3);
  } else {
    sampleCurveInto(emitter.scale0, through, out.scale, 0);
    flickerInto(emitter.scale0, serial, now, out.scale, 0);
  }
  if (linger?.color) sampleCurveInto(linger.color, l01, out.color, 0);
  else {
    sampleCurveInto(emitter.color, through, out.color, 0);
    flickerInto(emitter.color, serial, now, out.color, 0);
  }

  for (let channel = 0; channel < 3; channel += 1) {
    out.scale[channel] *= pool.birthScale[index * 3 + channel];
  }
  if (emitter.uniformScale && UNIFORMLY_SCALED.has(emitter.quadType)) {
    out.scale.fill(out.scale[0], 1, 3);
  }
  for (let channel = 0; channel < 4; channel += 1) {
    out.color[channel] *= pool.birthColor[index * 4 + channel] * emitter.modulation[channel];
  }
}

/**
 * How far through its life the particle at `index` stands, zero to one.
 *
 * The engine's `age01`, which every curve keyed on a particle rather than on its emitter
 * is read at. A particle that never expires stays at zero, and one whose lifetime has
 * been cut to nothing reads at the end.
 */
export function age01(pool: Pool, index: number, now: number): number {
  const lifetime = pool.lifetime[index];
  return lifetime > 0 ? clamp01((now - pool.birthTime[index]) / lifetime) : 1;
}

/** Scratch `worldAcceleration`'s offset is read into. */
const PUSHED = new Float32Array(3);

/**
 * Where the particle at `index` draws, into `out`.
 *
 * The particle's own matrix translation, through the frame it was born in, on where that
 * frame's origin stood at the birth. A particle of its own orientation takes the origin
 * alone, its translation having been turned by the system already. The share of the
 * system's travel `bindWeight` gave it is added in the world.
 *
 * `worldAcceleration` is added on top, un-turned: the curve integrated twice over the age,
 * times the lifetime squared. The lifetime is the pool's current one, which is what makes
 * the linger's rewrite move the offset in a single frame, and a particle that never
 * expires takes none.
 */
export function drawnPlaceInto(pool: Pool, index: number, frame: DrawFrame, out: DrawnPlace): void {
  const slot = index * 3;
  const emitter = frame.emitter;
  for (let axis = 0; axis < 3; axis += 1) out.place[axis] = pool.placed[slot + axis];
  if (!emitter.particleLocalOrientation) turnInto(pool.frame, out.place, 0, index * FRAME_SLOTS);
  for (let axis = 0; axis < 3; axis += 1) {
    out.place[axis] += pool.anchor[slot + axis] + pool.bound[slot + axis];
  }

  const lifetime = pool.lifetime[index];
  if (!Number.isFinite(lifetime)) return;

  PUSHED.fill(0);
  integratedInto(emitter.worldAcceleration, age01(pool, index, frame.now), 2, PUSHED, 0);
  for (let axis = 0; axis < 3; axis += 1) out.place[axis] += PUSHED[axis] * lifetime * lifetime;
}

/**
 * The frame the particle at `index` stands its own turn on, into `out`.
 *
 * `particleIsLocalOrientation` stands it on the system's orientation as it is now, and
 * the render pass drops the spawn frame it would otherwise be multiplied by. So such a
 * particle turns with its system where every other one keeps the frame it was born in,
 * which is what a rig that moves shows.
 */
export function standingFrameInto(
  pool: Pool,
  index: number,
  emitter: EmitterModel,
  frame: DrawFrame,
  out: Float32Array,
): void {
  if (emitter.particleLocalOrientation) {
    out.set(frame.orientation);
    return;
  }

  const at = index * FRAME_SLOTS;
  for (let slot = 0; slot < FRAME_SLOTS; slot += 1) out[slot] = pool.frame[at + slot];
}

/** Scratch one factor of a particle's basis is built in. */
const FACTOR = new Float32Array(FRAME_SLOTS);

/** The primitive kinds `isDirectionOriented` aims by their own `+Z`. */
const AIMED: ReadonlySet<number | null> = new Set([
  QUAD_TYPE.arbitraryQuad,
  QUAD_TYPE.mesh,
  QUAD_TYPE.attachedMesh,
]);

/**
 * The particle's own basis, without the frame it stands on, into `out`.
 *
 * The engine's order: the spin, `postRotateOrientationAxis`, the orbit, the definition's
 * `transform`, then the travel. The orbit and the transform turn the basis as they turn the
 * translation. `isDirectionOriented` then aims the particle's own `+Z` along the way its
 * matrix moved over the last step, on an arbitrary quad, a mesh and an attached mesh, and
 * a particle that did not move keeps its basis.
 */
export function ownBasisInto(
  pool: Pool,
  index: number,
  emitter: EmitterModel,
  frame: DrawFrame,
  out: Float32Array,
): void {
  standingInto(pool.rotation, index * 3, 0, out);
  if (emitter.postRotate !== null) {
    ORBITED.set(emitter.postRotate);
    multiplyInto(standingInto(ORBITED, 0, 0, FACTOR), out, out);
  }
  if (emitter.particleLocalOrientation) multiplyInto(frame.orientation, out, out);
  if (orbitInto(pool, index, frame.now - pool.birthTime[index], FACTOR)) {
    multiplyInto(FACTOR, out, out);
  }
  if (!frame.world.hud) multiplyInto(frame.world.basis, out, out);

  if (!emitter.directionOriented || !AIMED.has(emitter.quadType)) return;
  const slot = index * 3;
  if (pool.drift[slot] === 0 && pool.drift[slot + 1] === 0 && pool.drift[slot + 2] === 0) return;
  multiplyInto(alongInto(pool.drift, slot, FACTOR), out, out);
}

/**
 * The basis the particle at `index` stands on, in the engine's space, into `out`.
 *
 * Its own basis on the frame it was born in, which a particle of its own orientation
 * skips, the system's orientation being part of its own basis already.
 */
export function particleBasisInto(
  pool: Pool,
  index: number,
  emitter: EmitterModel,
  frame: DrawFrame,
  out: Float32Array,
): void {
  ownBasisInto(pool, index, emitter, frame, out);
  if (!emitter.particleLocalOrientation) multiplyInto(pool.frame, out, out, index * FRAME_SLOTS);
}

/**
 * The basis a direction-oriented camera quad reads its travel off, into `out`.
 *
 * Such a quad stays facing the eye and lays its up along the particle's velocity in the
 * world as the view sees it, so the basis carries that velocity as its `+Y` and nothing
 * of the particle's own turn. A particle standing still keeps the world's up.
 */
export function travelBasisInto(pool: Pool, index: number, out: Float32Array): void {
  const slot = index * 3;
  const speed = Math.hypot(pool.travel[slot], pool.travel[slot + 1], pool.travel[slot + 2]);
  out.set(UPRIGHT_BASIS);
  if (speed === 0) return;

  out[1] = pool.travel[slot] / speed;
  out[4] = pool.travel[slot + 1] / speed;
  out[7] = pool.travel[slot + 2] / speed;
}

const UPRIGHT_BASIS = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * How far one axis of the quad at `index` stretches with its speed, and one for none.
 *
 * `directionVelocityScale` per unit of the particle's speed in the world, held at
 * `directionVelocityMinScale` at the least. A camera quad stretches its up and an
 * arbitrary quad its side. The field is read whether or not the emitter is direction
 * oriented, and zero turns it off. A ray, a mesh, a ribbon and a simple emitter read none.
 */
export function stretchOf(pool: Pool, index: number, emitter: EmitterModel): number {
  if (emitter.directionVelocityScale === 0 || emitter.legacySimple !== null) return 1;
  if (
    emitter.quadType !== QUAD_TYPE.cameraQuad &&
    emitter.quadType !== QUAD_TYPE.cameraUnitQuad &&
    emitter.quadType !== QUAD_TYPE.arbitraryQuad
  ) {
    return 1;
  }

  const speed = Math.hypot(
    pool.travel[index * 3],
    pool.travel[index * 3 + 1],
    pool.travel[index * 3 + 2],
  );
  return Math.max(emitter.directionVelocityMinScale, speed * emitter.directionVelocityScale);
}

/**
 * The turn a particle `age` seconds old has orbited by, into `out`, and false where it has none.
 *
 * The angle is `birthOrbitalVelocity` times the age, in radians, which the standing basis
 * takes in degrees.
 */
export function orbitInto(pool: Pool, index: number, age: number, out: Float32Array): boolean {
  const slot = index * 3;
  if (pool.orbital[slot] === 0 && pool.orbital[slot + 1] === 0 && pool.orbital[slot + 2] === 0) {
    return false;
  }

  for (let axis = 0; axis < 3; axis += 1) {
    ORBITED[axis] = pool.orbital[slot + axis] * age * DEGREES_PER_RADIAN;
  }
  standingInto(ORBITED, 0, 0, out);
  return true;
}

/**
 * The whole spin of the particle at `index` about its quad's normal, in degrees.
 *
 * A complex emitter's camera quad rolls by the first euler angle, which `birthRotation0.x`
 * seeds. A simple emitter spins by the third, truncated to the whole degrees its basis
 * table indexes.
 */
export function spinOf(pool: Pool, index: number, emitter: EmitterModel): number {
  if (emitter.legacySimple === null) return pool.rotation[index * 3];
  return wholeTurn(pool.rotation[index * 3 + 2]);
}

/** The degrees a basis table wraps an angle into. */
const WHOLE_TURN = 360;

function wholeTurn(degrees: number): number {
  return ((Math.trunc(degrees) % WHOLE_TURN) + WHOLE_TURN) % WHOLE_TURN;
}

/**
 * The erosion drive for the particle at `index`: the map value its kept band opens at.
 *
 * `erosionDriveCurve` against the age, and `LingerErosionDriveCurve` against the linger's
 * own progress once the emitter has finished. One for an emitter eroding nothing, which
 * the shader never reads.
 */
export function erosionDrive(
  pool: Pool,
  index: number,
  emitter: EmitterModel,
  now: number,
): number {
  const erosion = emitter.erosion;
  if (erosion === null) return 1;

  const lingering = pool.lingerFrom[index] !== NOT_LINGERING;
  if (lingering && erosion.lingerDrive !== null) {
    return sampleScalar(erosion.lingerDrive, linger01(pool, index, emitter, now), 1);
  }

  return sampleScalar(erosion.drive, age01(pool, index, now), 1);
}

/**
 * How far through its linger the particle at `index` stands, zero to one.
 *
 * The time since its emitter's linger started over `particleLinger`. A particle whose
 * emitter runs is at zero.
 */
export function linger01(pool: Pool, index: number, emitter: EmitterModel, now: number): number {
  const from = pool.lingerFrom[index];
  if (from === NOT_LINGERING) return 0;

  const window = lingerSeconds(emitter);
  return window > 0 ? clamp01((now - from) / window) : 1;
}

/** Where `state`'s emitter stands in its own life now. */
export function life01(emitter: EmitterModel, state: EmitterState): number {
  return emitterPhase(emitter, state.age);
}

/** The first channel of a sample, and zero for a curve carrying none. */
export function scalar(sampled: readonly number[]): number {
  return sampled[0] ?? 0;
}

/** `value` held inside the unit interval, which is where a normalized time lives. */
export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
