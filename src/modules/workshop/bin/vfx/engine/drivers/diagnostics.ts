import type { SupportLevel } from "./node";

/**
 * What a driver diagnostic reports.
 *
 * - `inferred`: the node evaluates on a reading section 5 of docs/plans/shimmer-driver-graph.md
 *   has not confirmed
 * - `unknownClass`: the registry has no reading for the class, and the node reads as zero
 * - `kindMismatch`: the class outputs another kind than the slot holding it, and reads as zero
 * - `notADriver`: the slot holds something other than a struct, and reads as zero
 * - `emptyDriver`: the pointer holds nothing, and reads as zero
 * - `unreadFrequency`: a curve leaf's `frequency` is not the default `0`
 * - `unreadLooping`: a curve leaf sets `looping`, which the sampler does not wrap
 * - `undrawnTables`: a curve leaf's probability tables, which the sampler does not draw
 * - `emptyParams`: an n-ary class with an empty `params` list, which reads as zero
 * - `inverseBounds`: a clamp whose `Low` exceeds its `High` in some component, which reads
 *   as zero
 */
export type DriverDiagnosticCode =
  | "inferred"
  | "unknownClass"
  | "kindMismatch"
  | "notADriver"
  | "emptyDriver"
  | "unreadFrequency"
  | "unreadLooping"
  | "undrawnTables"
  | "emptyParams"
  | "inverseBounds";

/** One guess or gap in a graph, where it sits and how far it is trusted. */
export interface DriverDiagnostic {
  readonly code: DriverDiagnosticCode;
  readonly level: SupportLevel;
  /** The class of the node reported, and null for a slot holding no struct. */
  readonly classHash: string | null;
  readonly path: string;
}

/** The level each code reports at. */
export const DIAGNOSTIC_LEVEL: Readonly<Record<DriverDiagnosticCode, SupportLevel>> = {
  inferred: "inferred",
  unknownClass: "unsupported",
  kindMismatch: "unsupported",
  notADriver: "unsupported",
  emptyDriver: "inferred",
  unreadFrequency: "unsupported",
  unreadLooping: "unsupported",
  undrawnTables: "unsupported",
  emptyParams: "inferred",
  inverseBounds: "inferred",
};
