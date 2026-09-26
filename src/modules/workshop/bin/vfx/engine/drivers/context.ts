import type { Rng } from "../utils/Rng";

/** The particle a `particle`-scope evaluation reads. */
export interface ParticleSample {
  /** The particle's row in the pool. */
  readonly row: number;
  /** Seconds since the particle spawned. */
  readonly age: number;
  /** The particle's age over its lifetime, from 0 at spawn to 1 at death. */
  readonly age01: number;
  /** The particle's random slots, drawn at spawn. `CompiledDriver.randomSlots` sizes them. */
  readonly randoms: Float32Array;
}

/**
 * What a graph reads from the emitter and the particle it is evaluated for.
 *
 * The component runtime implements it over its own state, and a test builds one from
 * literals. The evaluator reads nothing else.
 */
export interface DriverContext {
  /** Seconds since the system started. */
  readonly now: number;
  /** Seconds since the emitter started. */
  readonly emitterAge: number;
  /** The emitter's age over its duration, from 0 to 1. */
  readonly emitterPhase: number;
  /** The emitter's random slots, drawn when the emitter starts. */
  readonly emitterRandoms: Float32Array;
  /** Null for an `emitter`-scope evaluation. */
  readonly particle: ParticleSample | null;
}

/** How many random slots a compiled graph reads, per block. */
export interface RandomSlots {
  readonly emitter: number;
  readonly particle: number;
}

/**
 * Fill a block of random slots from `rng`, one unit draw per slot in slot order.
 *
 * Per decision 2.5 of docs/plans/shimmer-driver-graph.md: the runtime fills a particle's
 * block at spawn and the emitter's at start, both from the system's seeded stream.
 */
export function drawRandoms(block: Float32Array, rng: Rng): void {
  for (let slot = 0; slot < block.length; slot += 1) block[slot] = rng.unitFloat();
}
