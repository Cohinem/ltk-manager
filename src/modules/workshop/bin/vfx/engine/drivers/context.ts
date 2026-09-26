/** The particle a `particle`-scope evaluation reads. */
export interface ParticleSample {
  /** The particle's row in the pool. */
  readonly row: number;
  /** The particle's age over its lifetime, from 0 at spawn to 1 at death. */
  readonly age01: number;
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
  /** Null for an `emitter`-scope evaluation. */
  readonly particle: ParticleSample | null;
}
