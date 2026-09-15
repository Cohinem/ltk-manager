/** One key of a curve: when it lands, and what each channel is worth there. */
export interface CurveKey {
  readonly time: number;
  /** One per channel: one for a scalar, two or three for a vector, four for a colour. */
  readonly values: readonly number[];
}

/**
 * One channel's probability table, as the file holds it.
 *
 * A particle's birth draws each channel's table at one chance through `drawCurve`.
 */
export interface ProbabilityTable {
  /** Which channel of the family the slot belongs to, in the list's own order. */
  readonly channel: number;
  /** The table's `singleValue`, which is what it is worth where it holds no keys. */
  readonly single: number;
  /** The table's own keys, one value each. Empty where it holds only `singleValue`. */
  readonly keys: readonly CurveKey[];
  /**
   * The two lists disagree in length, which the engine reads as 0. `single` is 0 and
   * `keys` empty to match.
   */
  readonly mismatched?: true;
}
