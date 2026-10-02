import type { CompiledDriver } from "../drivers/compileDriver";
import { type DriverContext, drawRandoms, type ParticleSample } from "../drivers/context";
import { Rng } from "../utils/Rng";
import type { ShimmerComponents } from "./shimmerComponents";

/** The most particles one emitter draws at once, the newest kept. */
export const MAX_SHIMMER_PARTICLES = 32;

/** One live particle of a shimmer emitter, in the engine's own space. */
export interface ShimmerParticle {
  /** Seconds since it spawned. */
  readonly age: number;
  /** Its age over its lifetime, and zero for one that lives for ever. */
  readonly age01: number;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  /** Degrees about each axis. */
  readonly rotation: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
}

/** A birth the runtime has placed: when, in which cycle of the emitter, and its seed. */
interface Birth {
  readonly time: number;
  readonly cycleStart: number;
  readonly cycleSeed: number;
  readonly seed: number;
}

/**
 * The particles `components` has alive `time` seconds after its system starts.
 *
 * A pure function of the time, so a scrub and a loop draw the same frame as a play does.
 * The emitter starts after `startDelay`, spawns its burst at once or spread over
 * `SpawnDuration`, and `EmissionRate` a second until `EmitterDuration` runs out. A negative
 * duration or lifetime lasts for ever. A looping behaviour starts over after its duration
 * and `LoopDelay`. Every emitter-scope property is read once at the emitter's start. An
 * emitter that writes neither a burst nor a rate spawns one particle, so it still draws.
 *
 * A particle's initial properties are read at its birth and its keyed ones at its age:
 * scale is `InitialScale` times `KeyedScale`, colour is `InitialColor` times
 * `ColorOverLife`, and it moves by its initial velocity under every acceleration.
 * Section 4.6 of docs/plans/shimmer-driver-graph.md.
 */
export function shimmerParticles(
  components: ShimmerComponents,
  time: number,
  seed: number,
): ShimmerParticle[] {
  const timing = timingOf(components);
  const slots = slotsOf(components);
  const alive: ShimmerParticle[] = [];

  for (const birth of birthsAt(timing, time, seed)) {
    const particle = particleAt(components, timing, slots, birth, time);
    if (particle !== null) alive.push(particle);
  }

  return alive.slice(-MAX_SHIMMER_PARTICLES);
}

/** How many particles `components` can have alive at once, capped at `MAX_SHIMMER_PARTICLES`. */
export function shimmerCapacity(components: ShimmerComponents): number {
  const timing = timingOf(components);
  const { lasting } = timing;
  const streamed = timing.rate > 0 ? Math.ceil(timing.rate * Math.min(lasting, timing.span)) : 0;
  const cycles = timing.looping && lasting > timing.cycle ? Math.ceil(lasting / timing.cycle) : 1;
  const total = (timing.burst + streamed) * cycles;
  return Math.min(Number.isFinite(total) ? total : MAX_SHIMMER_PARTICLES, MAX_SHIMMER_PARTICLES);
}

/** The emitter's schedule, read once at its start. */
interface Timing {
  readonly start: number;
  /** Seconds the emitter spawns for in one cycle, infinite for a negative duration. */
  readonly span: number;
  readonly looping: boolean;
  /** Seconds from one cycle's start to the next. */
  readonly cycle: number;
  readonly rate: number;
  readonly burst: number;
  readonly burstSpread: number;
  /** A particle's lifetime as read at the emitter's start, infinite for a negative one. */
  readonly lasting: number;
}

const EMITTER_START: DriverContext = {
  now: 0,
  emitterAge: 0,
  emitterPhase: 0,
  emitterRandoms: new Float32Array(0),
  particle: null,
};

function timingOf(components: ShimmerComponents): Timing {
  const duration = scalar(components.emitterDuration, EMITTER_START, -1);
  const span = duration < 0 ? Number.POSITIVE_INFINITY : duration;
  const loopDelay = Math.max(0, scalar(components.loopDelay, EMITTER_START, 0));
  const looping = components.looping && Number.isFinite(span) && span + loopDelay > 0;
  const lifetime = scalar(components.particleLifetime, EMITTER_START, -1);
  const spawns = components.burstCount !== null || components.emissionRate !== null;

  return {
    start: Math.max(0, scalar(components.startDelay, EMITTER_START, 0)),
    span,
    looping,
    cycle: looping ? span + loopDelay : Number.POSITIVE_INFINITY,
    rate: Math.max(0, scalar(components.emissionRate, EMITTER_START, 0)),
    burst: spawns ? Math.max(0, Math.round(scalar(components.burstCount, EMITTER_START, 0))) : 1,
    burstSpread: Math.max(0, scalar(components.spawnDuration, EMITTER_START, 0)),
    lasting: lifetime <= 0 ? Number.POSITIVE_INFINITY : lifetime,
  };
}

/**
 * Every birth up to `time` that can still be alive, oldest first.
 *
 * Only the last `MAX_SHIMMER_PARTICLES` of a stream are placed, and only the cycles a
 * particle of them can outlive, so a map left open for an hour places as few as a fresh one.
 */
function birthsAt(timing: Timing, time: number, seed: number): Birth[] {
  if (time < timing.start) return [];

  const births: Birth[] = [];
  const since = time - timing.start;
  const current = timing.looping ? Math.floor(since / timing.cycle) : 0;
  const outlived = !timing.looping
    ? 0
    : Number.isFinite(timing.lasting)
      ? Math.floor((since - timing.lasting - timing.span) / timing.cycle)
      : current - MAX_SHIMMER_PARTICLES;
  const first = Math.max(0, outlived);

  for (let cycle = first; cycle <= current; cycle += 1) {
    const cycleStart = timing.start + cycle * (timing.looping ? timing.cycle : 0);
    const cycleSeed = Math.imul(seed ^ (cycle + 1), 0x9e3779b1);

    for (let index = 0; index < timing.burst; index += 1) {
      const at = timing.burst > 1 ? (timing.burstSpread * index) / timing.burst : 0;
      if (cycleStart + at <= time) {
        births.push({ time: cycleStart + at, cycleStart, cycleSeed, seed: cycleSeed + index + 1 });
      }
    }

    if (timing.rate <= 0) continue;
    const spawning = Math.min(time - cycleStart, timing.span);
    const count = Math.floor(spawning * timing.rate);
    for (let index = Math.max(0, count - MAX_SHIMMER_PARTICLES); index <= count; index += 1) {
      const at = index / timing.rate;
      if (at > spawning) break;
      const own = cycleSeed + timing.burst + index + 1;
      births.push({ time: cycleStart + at, cycleStart, cycleSeed, seed: own });
    }
  }

  return births.sort((left, right) => left.time - right.time);
}

/** How many random slots each block holds, the most any one graph reads from it. */
function slotsOf(components: ShimmerComponents): { emitter: number; particle: number } {
  const graphs = [
    components.particleLifetime,
    components.initialScale,
    components.keyedScale,
    components.initialRotation,
    components.initialVelocity,
    components.initialColor,
    components.colorOverLife,
    ...components.acceleration,
  ];
  const counted = graphs.flatMap((graph) => (graph === null ? [] : [graph.randomSlots]));
  const most = (scope: "emitter" | "particle") =>
    Math.max(0, ...counted.map((slots) => slots[scope]));
  return { emitter: most("emitter"), particle: most("particle") };
}

function particleAt(
  components: ShimmerComponents,
  timing: Timing,
  slots: { emitter: number; particle: number },
  birth: Birth,
  time: number,
): ShimmerParticle | null {
  const emitterRandoms = new Float32Array(slots.emitter);
  drawRandoms(emitterRandoms, new Rng(birth.cycleSeed));
  const randoms = new Float32Array(slots.particle);
  drawRandoms(randoms, new Rng(birth.seed));
  const at = (age: number, age01: number, emitterAge: number) =>
    contextOf(timing, time, emitterAge, emitterRandoms, { row: 0, age, age01, randoms });
  const born = at(0, 0, birth.time - birth.cycleStart);

  const lifetime = scalar(components.particleLifetime, born, -1);
  const age = time - birth.time;
  if (age < 0 || (lifetime > 0 && age >= lifetime)) return null;

  const age01 = lifetime > 0 ? age / lifetime : 0;
  const now = at(age, age01, time - birth.cycleStart);

  const initialScale = vector(components.initialScale, born, 3, 1);
  const keyedScale = vector(components.keyedScale, now, 3, 1);
  const scale = initialScale.map((each, axis) => each * (keyedScale[axis] ?? 1));
  const velocity = vector(components.initialVelocity, born, 3, 0);
  const acceleration = [0, 0, 0];
  for (const graph of components.acceleration) {
    vector(graph, now, 3, 0).forEach((each, axis) => {
      acceleration[axis] = (acceleration[axis] ?? 0) + each;
    });
  }
  const position = velocity.map(
    (each, axis) => each * age + 0.5 * (acceleration[axis] ?? 0) * age * age,
  );
  const initialColor = vector(components.initialColor, born, 4, 1);
  const overLife = vector(components.colorOverLife, now, 4, 1);

  return {
    age,
    age01,
    position: triple(position),
    scale: components.uniformScale ? [scale[0] ?? 1, scale[0] ?? 1, scale[0] ?? 1] : triple(scale),
    rotation: triple(vector(components.initialRotation, born, 3, 0)),
    color: [
      (initialColor[0] ?? 1) * (overLife[0] ?? 1),
      (initialColor[1] ?? 1) * (overLife[1] ?? 1),
      (initialColor[2] ?? 1) * (overLife[2] ?? 1),
      (initialColor[3] ?? 1) * (overLife[3] ?? 1),
    ],
  };
}

function contextOf(
  timing: Timing,
  time: number,
  emitterAge: number,
  emitterRandoms: Float32Array,
  particle: ParticleSample,
): DriverContext {
  return {
    now: time,
    emitterAge,
    emitterPhase: Number.isFinite(timing.span) && timing.span > 0 ? emitterAge / timing.span : 0,
    emitterRandoms,
    particle,
  };
}

function scalar(graph: CompiledDriver | null, context: DriverContext, fallback: number): number {
  return vector(graph, context, 1, fallback)[0] ?? fallback;
}

/** `graph` evaluated into `width` floats, each `fallback` where no graph is written. */
function vector(
  graph: CompiledDriver | null,
  context: DriverContext,
  width: number,
  fallback: number,
): number[] {
  if (graph === null) return new Array<number>(width).fill(fallback);

  const out = new Float32Array(Math.max(width, graph.width));
  graph.evaluate(context, out, 0);
  return Array.from(out.subarray(0, width));
}

function triple(values: readonly number[]): [number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}
