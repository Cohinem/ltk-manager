/** The seconds of a pass an event holds over, both inside the pass. */
export interface Span {
  readonly at: number;
  readonly until: number;
}

/** What a step crossed of a span, and in which order. */
export const NONE = 0;
export const STARTS = 1;
export const ENDS = 2;
export const ENDS_THEN_STARTS = 3;
export const STARTS_THEN_ENDS = 4;

/**
 * A cue's span inside a pass of `duration` seconds, and null for a cue that starts at the
 * end of the pass or past it. A cue with no end, or one at or before its start, holds to
 * the end of the pass.
 */
export function spanOf(at: number, until: number | null, duration: number): Span | null {
  const from = Math.max(at, 0);
  if (!(from < duration)) return null;

  const held = until === null || until <= from;
  return { at: from, until: held ? duration : Math.min(until, duration) };
}

/**
 * What a step crossed of `span` as the pass ran from `before` to `now`, `before` excluded.
 *
 * `now` runs past `duration` for a step over the seam, where the end of one pass and the
 * start of the next are one moment, crossed as an end and then a start.
 */
export function crossing(span: Span, before: number, now: number, duration: number): number {
  const started = lastReach(span.at, now, duration);
  const ended = lastReach(span.until, now, duration);
  if (started > before && ended > before) {
    return ended > started ? STARTS_THEN_ENDS : ENDS_THEN_STARTS;
  }
  if (started > before) return STARTS;

  return ended > before ? ENDS : NONE;
}

/** The step crossed the end of a span before anything else of it. */
export function endsFirst(order: number): boolean {
  return order === ENDS || order === ENDS_THEN_STARTS;
}

export function starts(order: number): boolean {
  return order !== NONE && order !== ENDS;
}

/** The step crossed the start of a span and then its end. */
export function endsLast(order: number): boolean {
  return order === STARTS_THEN_ENDS;
}

/** Where a pass that has run to `now` last reached `moment`, and before every time for never. */
function lastReach(moment: number, now: number, duration: number): number {
  if (now < moment) return Number.NEGATIVE_INFINITY;

  return Math.min(moment + Math.floor((now - moment) / duration) * duration, now);
}
