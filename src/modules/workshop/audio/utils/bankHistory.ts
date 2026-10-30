import type { HistoryStep } from "@/modules/editor";

/** The undo and redo steps of an open event bank, as the document counted them. */
export interface HistoryDepth {
  readonly undo: number;
  readonly redo: number;
}

/** The depth of a bank that took no edit since it opened. */
export const NO_HISTORY: HistoryDepth = { undo: 0, redo: 0 };

/** Returns the depth after an edit, which adds an undo step and drops the redo steps. */
export function afterEdit(depth: HistoryDepth): HistoryDepth {
  return { undo: depth.undo + 1, redo: 0 };
}

/**
 * Returns the depth after a step in `direction`.
 *
 * If the bank took no step, its history in that direction is empty, so the count resets to 0.
 * That also corrects a count past the bank's own history limit.
 */
export function afterStep(
  depth: HistoryDepth,
  direction: HistoryStep,
  stepped: boolean,
): HistoryDepth {
  if (!stepped) return { ...depth, [direction]: 0 };
  if (direction === "undo") return { undo: Math.max(depth.undo - 1, 0), redo: depth.redo + 1 };
  return { undo: depth.undo + 1, redo: Math.max(depth.redo - 1, 0) };
}
