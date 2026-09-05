import { useMemo } from "react";

import { letterMask } from "./matcher";
import { compareRows, rankCandidates } from "./rank";
import { HELP_PREFIX, PALETTE_SOURCES, type ParsedQuery, sourceCap } from "./sources";
import type {
  BackendRankedGroups,
  LocalSourceId,
  PaletteCandidate,
  PaletteCandidates,
  PaletteGroup,
  PaletteSourceId,
  RankedRow,
} from "./types";

const NO_RANGES = [] as const;
const NO_CANDIDATES: readonly PaletteCandidate[] = [];
const NO_RECENT: readonly string[] = [];
const NO_RANKED: BackendRankedGroups = {};

export interface PaletteSearchParams {
  /** The query split into its scope, its help flag and the term to match on. */
  readonly parsed: ParsedQuery;
  /** Which sources this context holds, read against the declared order. */
  readonly sources: readonly PaletteSourceId[];
  readonly candidates: PaletteCandidates;
  /** What each backend-ranked source contributes, for a context that reads one. */
  readonly ranked?: BackendRankedGroups;
  /** The layer the side panels are reading, whose files rank above the rest. */
  readonly selectedLayer?: string | null;
  /** Visited document ids, nearest first. */
  readonly recent?: readonly string[];
}

/**
 * The grouped rows the bar draws for one query.
 *
 * What is in the list is the caller's, so the same box answers for a project,
 * for the workshop over it, and for whatever is added to either.
 *
 * Per "What an empty box lists" in `docs/ux/WORKSHOP.md`.
 */
export function usePaletteSearch({
  parsed,
  sources,
  candidates,
  ranked = NO_RANKED,
  selectedLayer = null,
  recent = NO_RECENT,
}: PaletteSearchParams): readonly PaletteGroup[] {
  return useMemo(() => {
    if (parsed.help) return [helpGroup(parsed.term, sources)];

    const active = PALETTE_SOURCES.filter(
      (source) =>
        sources.includes(source.id) && (parsed.scope === null || source.id === parsed.scope),
    );
    const listing = listingSources(sources);

    const found = active.flatMap((source) => {
      /* The backend already capped and ordered this one, so the group is only
         trimmed again where it has to share the list. */
      if (source.backendRanked) {
        const group = ranked[source.id];
        if (!group) return [];
        return [{ ...group, rows: group.rows.slice(0, sourceCap(source, parsed.scope)) }];
      }

      const rows = matchSource(source.id, candidates[source.id] ?? NO_CANDIDATES, parsed, listing, {
        selectedLayer,
        recent,
      });
      if (rows.length === 0) return [];

      return [
        {
          source: source.id,
          label: source.label,
          rows: rows.slice(0, sourceCap(source, parsed.scope)),
          total: rows.length,
        },
      ];
    });

    /* A listing keeps its own order. A term is ranked instead, so the groups
       reorder by what they found. */
    if (parsed.term.length === 0) {
      return found.sort((a, b) => listing.indexOf(a.source) - listing.indexOf(b.source));
    }
    return found.sort(compareGroups);
  }, [candidates, parsed, ranked, recent, selectedLayer, sources]);
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

/**
 * Picks the sources an empty box shows, and the order it shows them in.
 *
 * Files, strings and the game wait for a term - a project of a few thousand
 * files would be a wall of rows nobody asked for.
 */
function listingSources(sources: readonly PaletteSourceId[]): readonly PaletteSourceId[] {
  const underProject = sources.includes("documents");
  if (underProject) return ["documents", "layers", "commands"];
  return ["commands", "projects"];
}

function matchSource(
  id: LocalSourceId,
  candidates: readonly PaletteCandidate[],
  parsed: ParsedQuery,
  listing: readonly PaletteSourceId[],
  context: { selectedLayer: string | null; recent: readonly string[] },
): RankedRow[] {
  if (parsed.term.length > 0) return rankCandidates(parsed.term, candidates, context);

  if (parsed.scope === null && !listing.includes(id)) return [];

  const rows = id === "documents" ? byRecency(candidates, context.recent) : candidates;
  return rows.map((candidate) => ({
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

/** What `?` lists: every prefix this context holds, and what it narrows to. */
function helpGroup(term: string, sources: readonly PaletteSourceId[]): PaletteGroup {
  const rows = PALETTE_SOURCES.flatMap((source) => {
    if (source.prefix === undefined || !sources.includes(source.id)) return [];
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
