/**
 * What a search query is, and what it matches.
 *
 * Plain substring matching, and the twin of `crates/ltk-manager-core/src/matcher.rs`.
 * The two must agree on order, so `__tests__/ranking.fixture.json` is checked by
 * both suites. Change one and the other's fixture test fails.
 *
 * A query is split on whitespace and every term has to appear, which is the
 * search a file manager does and the one a modder expects. Subsequence matching
 * was the first attempt and it is the wrong default here: `nasus` has its five
 * letters in order inside nearly every long asset path, so it matched 137,032
 * files of a live install and buried the four that were wanted.
 */

/** A term beginning at a word boundary, which is where a name starts. */
const BOUNDARY_BONUS = 1;
/** A term that is a whole word, rather than a run inside one. */
const WHOLE_WORD_BONUS = 0.5;
/** What a term is worth before either bonus. */
const TERM_SCORE = 1;

const SEPARATORS = new Set(["/", "\\", "_", "-", ".", " "]);

/** A half-open run of matched characters, as `[start, end)`. */
export type MatchRange = readonly [start: number, end: number];

export interface Match {
  readonly score: number;
  readonly ranges: readonly MatchRange[];
}

/**
 * A query, split into the terms a candidate has to hold all of.
 *
 * Built once per search and read against every candidate, so the split and the
 * lowercasing are paid for once rather than once per row.
 */
export interface Query {
  readonly terms: readonly string[];
  /** The letters every term holds together, for a candidate mask to cover. */
  readonly mask: number;
}

/** Split `raw` into its terms, or report that it asks for nothing. */
export function compileQuery(raw: string): Query | null {
  const terms = raw
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  if (terms.length === 0) return null;

  return { terms, mask: terms.reduce((mask, term) => mask | letterMask(term), 0) };
}

/**
 * Whether `text` opens with the query's first term.
 *
 * What separates a name a query names from a name that merely holds it.
 */
export function startsQuery(query: Query, text: string): boolean {
  const first = query.terms[0];
  return first !== undefined && text.toLowerCase().startsWith(first);
}

/**
 * Score `text`, or report that it does not hold every term.
 *
 * Compared case-insensitively. A term is read where it reads best, which is at
 * a word boundary wherever the candidate offers one.
 */
export function matchQuery(query: Query, text: string): Match | null {
  const lower = text.toLowerCase();
  const ranges: MatchRange[] = [];
  let score = 0;

  for (const term of query.terms) {
    const at = bestOccurrence(lower, term);
    if (at < 0) return null;
    const end = at + term.length;

    score += TERM_SCORE;
    if (startsWord(lower, at)) {
      score += BOUNDARY_BONUS;
      if (endsWord(lower, end)) score += WHOLE_WORD_BONUS;
    }
    ranges.push([at, end]);
  }

  return { score, ranges: merge(ranges) };
}

/**
 * Where a term is best read: at a word boundary, or failing that at all.
 *
 * A boundary is what a reader's eye lands on, so `base` in `.../base/skin.bin`
 * beats the `base` buried inside `databases.bin`.
 */
function bestOccurrence(lower: string, term: string): number {
  const first = lower.indexOf(term);
  if (first < 0 || startsWord(lower, first)) return first;

  let at = first;
  for (;;) {
    const next = lower.indexOf(term, at + 1);
    if (next < 0) return first;
    if (startsWord(lower, next)) return next;
    at = next;
  }
}

/** Whether `at` opens a word: the start, or a character after a separator. */
function startsWord(lower: string, at: number): boolean {
  if (at === 0) return true;
  return SEPARATORS.has(lower[at - 1]!);
}

/** Whether `at` closes a word: the end, or the character after it separates. */
function endsWord(lower: string, at: number): boolean {
  return at === lower.length || SEPARATORS.has(lower[at]!);
}

/** Sort the runs and fold any that touch, so a row marks each character once. */
function merge(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length < 2) return ranges;
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * The letters a string holds, one bit per `a` to `z`.
 *
 * A query whose mask is not a subset of a candidate's cannot match it, so one
 * `AND` rejects most rows before the matcher reads a character. Digits and
 * punctuation are outside the mask and so never reject on their own.
 */
export function letterMask(lower: string): number {
  let mask = 0;
  for (let i = 0; i < lower.length; i += 1) {
    const code = lower.charCodeAt(i);
    if (code >= 97 && code <= 122) mask |= 1 << (code - 97);
  }
  return mask;
}

/** Whether `candidate`'s letters cover every letter the query asks for. */
export function maskCovers(candidate: number, query: number): boolean {
  return (query & ~candidate) === 0;
}
