import {
  compileQuery,
  maskCovers,
  type Match,
  matchQuery,
  type MatchRange,
  type Query,
  startsQuery,
} from "./matcher";
import type { PaletteCandidate, RankedRow } from "./types";

/** The row is in the layer the side panels are reading. */
const SELECTED_LAYER_BONUS = 0.5;
/** The row is the document a user just left, worth most at the top of the stack. */
const RECENT_BONUS = 1;
/** How deep into the history a row still earns something. */
const RECENT_DEPTH = 8;

const NO_RANGES: readonly MatchRange[] = [];

export interface RankContext {
  /** The layer every layer-scoped panel reads, whose files rank above the rest. */
  readonly selectedLayer: string | null;
  /** Visited document ids, most recent first. */
  readonly recent: readonly string[];
}

/**
 * Match every candidate against `query`, best first.
 *
 * `query` must be non-empty. An empty query is a listing rather than a search,
 * and the caller orders that one itself.
 */
export function rankCandidates(
  query: string,
  candidates: readonly PaletteCandidate[],
  context: RankContext,
): RankedRow[] {
  const compiled = compileQuery(query);
  if (!compiled) return [];

  const rows: RankedRow[] = [];
  for (const candidate of candidates) {
    if (!maskCovers(candidate.mask, compiled.mask)) continue;
    const row = rankCandidate(compiled, candidate, context);
    if (row) rows.push(row);
  }

  return rows.sort(compareRows);
}

/**
 * One candidate's band, score and marked runs, or null when it does not match.
 *
 * A string query is compiled first, which is what a caller ranking one row at a
 * time - a test, or a future single-row check - would otherwise repeat.
 */
export function rankCandidate(
  query: Query | string,
  candidate: PaletteCandidate,
  context: RankContext,
): RankedRow | null {
  const compiled = typeof query === "string" ? compileQuery(query) : query;
  if (!compiled) return null;

  const bonus = contextBonus(candidate, context);

  if (candidate.nameCut !== undefined) {
    return rankObjectPath(compiled, candidate, candidate.nameCut, bonus);
  }

  const byName = matchQuery(compiled, candidate.name);
  if (byName) {
    return {
      row: candidate,
      band: startsQuery(compiled, candidate.name) ? 0 : 1,
      score: byName.score + bonus,
      nameRanges: byName.ranges,
      pathRanges: NO_RANGES,
    };
  }

  /* A name holding only some of the terms still gets its path read, because
     the rest of them may be in a directory above it. */
  if (candidate.path.length === 0) return matchKeywords(compiled, candidate, bonus);

  const full = `${candidate.path}/${candidate.name}`;
  const byPath = matchQuery(compiled, full);
  if (!byPath) return matchKeywords(compiled, candidate, bonus);

  const { pathRanges, nameRanges } = splitRanges(byPath, candidate.path.length);
  return { row: candidate, band: 2, score: byPath.score + bonus, nameRanges, pathRanges };
}

/**
 * Band, score and marked runs for a name that is a whole object path.
 *
 * The segment after `cut` is the name: a query that opens it is band 0, one it
 * holds is band 1, and a query the rest of the path is needed for is band 2.
 * The runs are offsets into the whole name either way, and `path` is never
 * read. The rule the backend's `rank` applies to the install's rows.
 */
function rankObjectPath(
  query: Query,
  candidate: PaletteCandidate,
  cut: number,
  bonus: number,
): RankedRow | null {
  const bySegment = matchQuery(query, candidate.name.slice(cut));
  if (bySegment) {
    return {
      row: candidate,
      band: startsQuery(query, candidate.name.slice(cut)) ? 0 : 1,
      score: bySegment.score + bonus,
      nameRanges: bySegment.ranges.map(([start, end]) => [start + cut, end + cut]),
      pathRanges: NO_RANGES,
    };
  }

  if (cut === 0) return matchKeywords(query, candidate, bonus);

  const byPath = matchQuery(query, candidate.name);
  if (!byPath) return matchKeywords(query, candidate, bonus);
  return {
    row: candidate,
    band: 2,
    score: byPath.score + bonus,
    nameRanges: byPath.ranges,
    pathRanges: NO_RANGES,
  };
}

/**
 * Cut one match over `path/name` into the runs each of the two lines marks.
 *
 * A run covering the separator marks a character neither line holds, so the cut
 * drops it rather than handing either line an offset past its end.
 */
function splitRanges(
  match: Match,
  slash: number,
): { pathRanges: MatchRange[]; nameRanges: MatchRange[] } {
  const pathRanges: MatchRange[] = [];
  const nameRanges: MatchRange[] = [];

  for (const [start, end] of match.ranges) {
    if (end <= slash) {
      pathRanges.push([start, end]);
      continue;
    }
    if (start > slash) {
      nameRanges.push([start - slash - 1, end - slash - 1]);
      continue;
    }
    if (start < slash) pathRanges.push([start, slash]);
    if (end > slash + 1) nameRanges.push([0, end - slash - 1]);
  }
  return { pathRanges, nameRanges };
}

/** The last resort: words the row carries but does not show, so nothing marks. */
function matchKeywords(query: Query, candidate: PaletteCandidate, bonus: number): RankedRow | null {
  if (candidate.keywords === undefined) return null;

  const match = matchQuery(query, candidate.keywords);
  if (!match) return null;
  return {
    row: candidate,
    band: 2,
    score: match.score + bonus,
    nameRanges: NO_RANGES,
    pathRanges: NO_RANGES,
  };
}

function contextBonus(candidate: PaletteCandidate, context: RankContext): number {
  let bonus = 0;
  if (candidate.layerName && candidate.layerName === context.selectedLayer) {
    bonus += SELECTED_LAYER_BONUS;
  }

  const depth = context.recent.indexOf(candidate.documentId ?? candidate.id);
  if (depth >= 0 && depth < RECENT_DEPTH) {
    bonus += RECENT_BONUS * (1 - depth / RECENT_DEPTH);
  }
  return bonus;
}

/**
 * Band, then score, then the shorter path, so equal rows still order the same way.
 *
 * The length and the two string compares are taken off `path` and `name` rather
 * than off a joined form, because the backend's matcher orders its own rows the
 * same way and has no joined form to take them off.
 */
export function compareRows(a: RankedRow, b: RankedRow): number {
  if (a.band !== b.band) return a.band - b.band;
  if (a.score !== b.score) return b.score - a.score;

  const length = rowLength(a) - rowLength(b);
  if (length !== 0) return length;

  const path = a.row.path.localeCompare(b.row.path);
  if (path !== 0) return path;
  return a.row.name.localeCompare(b.row.name);
}

function rowLength(row: RankedRow): number {
  return row.row.path.length + row.row.name.length;
}
