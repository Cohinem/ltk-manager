import { useMemo } from "react";

import { letterMask } from "./matcher";
import { compareRows, rankCandidates } from "./rank";
import {
  GROUP_CAP,
  HELP_PREFIX,
  PALETTE_SOURCES,
  type ParsedQuery,
  parseQuery,
  SCOPED_CAP,
} from "./sources";
import type { PaletteCandidate, PaletteGroup, PaletteSourceId, RankedRow } from "./types";
import { useGameRows } from "./useGameRows";
import { useProjectCandidates } from "./useProjectCandidates";

const NO_RANGES = [] as const;

export interface PaletteSearchResult {
  /** The scope the query's own prefix asked for, and the term left after it. */
  readonly parsed: ParsedQuery;
  readonly groups: readonly PaletteGroup[];
}

export interface ProjectSearchParams {
  /** False while the bar is idle, which keeps the candidates unbuilt. */
  readonly enabled: boolean;
  /** What the user typed, prefix and all. */
  readonly query: string;
  /** The chip already before the caret, or null while the box reads every source. */
  readonly scope: PaletteSourceId | null;
  /** The layer the side panels are reading, whose files rank above the rest. */
  readonly selectedLayer: string | null;
  /** Visited document ids, nearest first. */
  readonly recent: readonly string[];
}

/**
 * The grouped rows the project bar draws for one query.
 *
 * An empty query is a listing rather than a search: it hands back where the
 * user has been and what the editor can do, which makes `Ctrl+P` and `Enter`
 * the route back to the last file with nothing typed.
 */
export function useProjectSearch({
  enabled,
  query,
  scope,
  selectedLayer,
  recent,
}: ProjectSearchParams): PaletteSearchResult {
  const candidates = useProjectCandidates(enabled);
  const parsed = useMemo(() => parseQuery(query, scope), [query, scope]);

  /* The one source that crosses IPC, so it is asked for on its own and folded
     in wherever its group sits. */
  const wantsGame = enabled && !parsed.help && (parsed.scope === null || parsed.scope === "game");
  const game = useGameRows(parsed.term, wantsGame);

  const groups = useMemo(() => {
    if (!enabled) return [];
    if (parsed.help) return [helpGroup(parsed.term)];

    const sources = PALETTE_SOURCES.filter(
      (source) => parsed.scope === null || source.id === parsed.scope,
    );
    /* A cap only matters where several sources compete for the list. One
       source on its own, and a listing with nothing typed, show what they have. */
    const capped = parsed.term.length > 0 && parsed.scope === null;
    const cap = capped ? GROUP_CAP : SCOPED_CAP;

    const found = sources.flatMap((source) => {
      /* The backend already capped and ordered this one, so the group is only
         trimmed again where it has to share the list. */
      if (source.id === "game") {
        if (!game) return [];
        return [{ ...game, rows: game.rows.slice(0, cap) }];
      }

      const rows = matchSource(source.id, candidates[source.id], parsed, { selectedLayer, recent });
      if (rows.length === 0) return [];

      return [
        {
          source: source.id,
          label: source.label,
          rows: rows.slice(0, cap),
          total: rows.length,
        },
      ];
    });

    /* Nothing typed is a listing, and a listing reads in the order the sources
       are declared: where you have been, then what you can do. */
    if (parsed.term.length === 0) return found;
    return found.sort(compareGroups);
  }, [candidates, enabled, game, parsed, recent, selectedLayer]);

  return { parsed, groups };
}

/**
 * The group whose best row is the best row, first.
 *
 * A fixed order put a source that matched nothing well above one that matched
 * exactly: a project holding no `nasus` still answers with whatever it could
 * scatter the query across, and that sat above the install's own `nasus.bin`.
 * The declared order stays as the tiebreak, so two groups that found equally
 * good rows still read the same way every time.
 */
function compareGroups(a: PaletteGroup, b: PaletteGroup): number {
  const declared = sourceOrder(a.source) - sourceOrder(b.source);

  /* A group still waiting for its first rows has nothing to compare, so it
     keeps its declared place rather than claiming the top on no evidence. */
  const first = a.rows[0];
  const second = b.rows[0];
  if (!first || !second) return declared;

  return compareRows(first, second) || declared;
}

function sourceOrder(source: PaletteSourceId): number {
  return PALETTE_SOURCES.findIndex((candidate) => candidate.id === source);
}

function matchSource(
  id: Exclude<PaletteSourceId, "game">,
  candidates: readonly PaletteCandidate[],
  parsed: ParsedQuery,
  context: { selectedLayer: string | null; recent: readonly string[] },
): RankedRow[] {
  if (parsed.term.length > 0) return rankCandidates(parsed.term, candidates, context);

  /* Nothing typed and no scope: the two sources that answer "where was I" and
     "what can I do". Listing every file of the project under an empty box is a
     wall of rows nobody asked for. */
  if (parsed.scope === null && id !== "documents" && id !== "commands") return [];

  const listed = id === "documents" ? byRecency(candidates, context.recent) : candidates;
  return listed.map((candidate) => ({
    row: candidate,
    band: 0,
    score: 0,
    nameRanges: NO_RANGES,
    pathRanges: NO_RANGES,
  }));
}

/** Visited first, in the order the arrows would walk them, then the rest. */
function byRecency(
  candidates: readonly PaletteCandidate[],
  recent: readonly string[],
): PaletteCandidate[] {
  const rank = new Map(recent.map((id, at) => [id, at]));
  return [...candidates].sort(
    (a, b) => (rank.get(a.id) ?? recent.length) - (rank.get(b.id) ?? recent.length),
  );
}

/** What `?` lists: every prefix, and what typing it narrows the box to. */
function helpGroup(term: string): PaletteGroup {
  const rows = PALETTE_SOURCES.flatMap((source) => {
    if (source.prefix === undefined) return [];
    if (term.length > 0 && !source.label.toLowerCase().includes(term)) return [];

    const name = `${source.prefix}  ${source.label}`;
    return [
      {
        row: {
          id: `prefix:${source.prefix}`,
          source: source.id,
          name,
          path: "",
          trailing: source.hint,
          icon: null,
          target: { kind: "prefix", prefix: source.prefix } as const,
          nameLower: name.toLowerCase(),
          fullLower: name.toLowerCase(),
          mask: letterMask(name.toLowerCase()),
        },
        band: 0,
        score: 0,
        nameRanges: NO_RANGES,
        pathRanges: NO_RANGES,
      },
    ];
  });

  return { source: "commands", label: `${HELP_PREFIX} Prefixes`, rows, total: rows.length };
}
