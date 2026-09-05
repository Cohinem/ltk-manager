import { CubeIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { m } from "@/i18n";

import { completeClassTerm, splitClassTerm } from "./classTerm";
import { compareRows, rankCandidates, type RankContext } from "./rank";
import {
  HELP_PREFIX,
  PALETTE_SOURCES,
  type PaletteSource,
  type ParsedQuery,
  sourceCap,
} from "./sources";
import type {
  BackendRankedGroups,
  LocalSourceId,
  PaletteCandidate,
  PaletteCandidates,
  PaletteGroup,
  PaletteSourceId,
  PaletteTarget,
  RankedRow,
} from "./types";

const NO_RANGES = [] as const;
const NO_CANDIDATES: readonly PaletteCandidate[] = [];
const NO_RECENT: readonly string[] = [];
const NO_RANKED: BackendRankedGroups = {};
const NO_LABELS: Partial<Record<PaletteSourceId, string>> = {};

export interface PaletteSearchParams {
  /** The query split into its scope, its help flag and the term to match on. */
  readonly parsed: ParsedQuery;
  /** Which sources this context holds, read against the declared order. */
  readonly sources: readonly PaletteSourceId[];
  readonly candidates: PaletteCandidates;
  /** What each backend-ranked source contributes, for a context that reads one. */
  readonly ranked?: BackendRankedGroups;
  /** The label a context gives a source, over the declared one. */
  readonly labels?: Partial<Record<PaletteSourceId, string>>;
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
  labels = NO_LABELS,
  selectedLayer = null,
  recent = NO_RECENT,
}: PaletteSearchParams): readonly PaletteGroup[] {
  return useMemo(() => {
    if (parsed.help) return [helpGroup(parsed.term, sources)];

    const active = PALETTE_SOURCES.filter(
      (source) => sources.includes(source.id) && underScope(source, parsed.scope),
    );
    const listing = listingSources(sources);
    const context = { selectedLayer, recent };

    const found = active.flatMap((source) => {
      /* The backend already capped and ordered this one, so the group is only
         trimmed again where it has to share the list. */
      if (source.backendRanked) {
        const group = ranked[source.id];
        if (!group) return [];
        return [{ ...group, rows: group.rows.slice(0, sourceCap(source, parsed.scope)) }];
      }

      const label = labels[source.id] ?? source.label;
      const held = candidates[source.id] ?? NO_CANDIDATES;
      const group =
        source.id === "projectObjects"
          ? projectObjectsGroup(parsed, held, listing, label, context)
          : localGroup(source.id, held, parsed, listing, label, context);
      if (!group) return [];

      return [{ ...group, rows: group.rows.slice(0, sourceCap(source, parsed.scope)) }];
    });

    /* A listing keeps its own order. A term is ranked instead, so the groups
       reorder by what they found. */
    if (parsed.term.length === 0) {
      return found.sort((a, b) => listing.indexOf(a.source) - listing.indexOf(b.source));
    }
    return leadWithProjectObjects(found.sort(compareGroups));
  }, [candidates, labels, parsed, ranked, recent, selectedLayer, sources]);
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

/**
 * `groups` with the project's objects moved ahead of the install's, whatever
 * each found. Per "The project's own objects" in `docs/ux/PROJECT_EDITOR.md`.
 *
 * A pass after the sort rather than a rule inside it, because a comparator
 * that ranks one pair by declared order and the rest by score is not
 * transitive across three groups.
 */
function leadWithProjectObjects(groups: PaletteGroup[]): PaletteGroup[] {
  const project = groups.findIndex((group) => group.source === "projectObjects");
  const install = groups.findIndex((group) => group.source === "objects");
  if (project < 0 || install < 0 || project < install) return groups;

  const [moved] = groups.splice(project, 1);
  groups.splice(install, 0, moved!);
  return groups;
}

function sourceOrder(source: PaletteSourceId): number {
  return PALETTE_SOURCES.findIndex((candidate) => candidate.id === source);
}

/** Whether `source` answers under `scope`, which every source does under none. */
function underScope(source: PaletteSource, scope: PaletteSourceId | null): boolean {
  return scope === null || source.id === scope || source.scopedWith === scope;
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

function localGroup(
  id: LocalSourceId,
  candidates: readonly PaletteCandidate[],
  parsed: ParsedQuery,
  listing: readonly PaletteSourceId[],
  label: string,
  context: RankContext,
): PaletteGroup | null {
  const rows = matchSource(id, candidates, parsed, listing, context);
  if (rows.length === 0) return null;
  return { source: id, label, rows, total: rows.length };
}

function matchSource(
  id: LocalSourceId,
  candidates: readonly PaletteCandidate[],
  parsed: ParsedQuery,
  listing: readonly PaletteSourceId[],
  context: RankContext,
): RankedRow[] {
  if (parsed.term.length > 0) return rankCandidates(parsed.term, candidates, context);

  if (parsed.scope === null && !listing.includes(id)) return [];

  const rows = id === "documents" ? byRecency(candidates, context.recent) : candidates;
  return rows.map(listingRow);
}

function listingRow(candidate: PaletteCandidate): RankedRow {
  return { row: candidate, band: 0, score: 0, nameRanges: NO_RANGES, pathRanges: NO_RANGES };
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

/** One class the project's rows declare, and how many of them. */
interface ClassCount {
  readonly name: string;
  readonly hash: string;
  count: number;
}

/**
 * The project's objects for one query, read the way the install's index reads it.
 *
 * A `class:` term narrows the rows to the classes it opens before the rest of
 * the query matches the path. While that term is the last one typed and it
 * opens anything but one class, the group is the classes themselves, each a
 * completion. Per "Searching it" in `docs/ux/PROJECT_EDITOR.md`.
 */
function projectObjectsGroup(
  parsed: ParsedQuery,
  candidates: readonly PaletteCandidate[],
  listing: readonly PaletteSourceId[],
  label: string,
  context: RankContext,
): PaletteGroup | null {
  const source = "projectObjects";
  const term = splitClassTerm(parsed.term);
  if (term === null) return localGroup(source, candidates, parsed, listing, label, context);

  const opened = classesOpenedBy(term.value, candidates);
  if (term.last && opened.size !== 1) {
    const rows = [...opened.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((klass) => completionRow(source, klass, parsed.query));
    if (rows.length === 0) return null;
    return { source, label: m.workshop_objects_classes_label(), rows, total: rows.length };
  }

  const narrowed = candidates.filter(
    (candidate) => candidate.objectClass !== undefined && opened.has(candidate.objectClass.hash),
  );
  const rows =
    term.rest.length > 0
      ? rankCandidates(term.rest, narrowed, context)
      : [...narrowed].sort((a, b) => a.name.localeCompare(b.name)).map(listingRow);
  return rows.length === 0 ? null : { source, label, rows, total: rows.length };
}

/** The classes `value` opens among `candidates`, by hash: one by hex, a prefix's worth by name. */
function classesOpenedBy(
  value: string,
  candidates: readonly PaletteCandidate[],
): Map<string, ClassCount> {
  const hex = classHash(value);
  const prefix = value.toLowerCase();
  const opened = new Map<string, ClassCount>();

  for (const candidate of candidates) {
    const klass = candidate.objectClass;
    if (!klass) continue;
    const matches =
      hex !== null ? klass.hash.toLowerCase() === hex : klass.name.toLowerCase().startsWith(prefix);
    if (!matches) continue;

    const held = opened.get(klass.hash);
    if (held) held.count += 1;
    else opened.set(klass.hash, { name: klass.name, hash: klass.hash, count: 1 });
  }
  return opened;
}

/** `value` as the `0x` form of a class hash, or null when it is not eight hex digits. */
function classHash(value: string): string | null {
  const digits = value.replace(/^0x/i, "");
  return /^[0-9a-f]{8}$/i.test(digits) ? `0x${digits.toLowerCase()}` : null;
}

/** One class as a completion: choosing it writes the class term out in full. */
function completionRow(source: PaletteSourceId, klass: ClassCount, query: string): RankedRow {
  return {
    row: {
      id: `class:${klass.hash}`,
      source,
      name: klass.name,
      path: "",
      trailing: m.workshop_objects_class_count_label({ count: klass.count }),
      icon: <CubeIcon className="h-4 w-4 text-surface-400" />,
      target: { kind: "query", query: completeClassTerm(query, klass.name) },
    },
    band: 0,
    score: 0,
    nameRanges: NO_RANGES,
    pathRanges: NO_RANGES,
  };
}

/**
 * What `?` lists: every prefix this context holds, and what it narrows to.
 *
 * A key a source reads follows its prefix row, so `$  class:` sits under
 * `$  Objects` and a filter on either word finds it.
 */
function helpGroup(term: string, sources: readonly PaletteSourceId[]): PaletteGroup {
  const rows = PALETTE_SOURCES.flatMap((source) => {
    const { prefix } = source;
    if (prefix === undefined || !sources.includes(source.id)) return [];

    const rows: RankedRow[] = [];
    if (term.length === 0 || source.label.toLowerCase().includes(term)) {
      rows.push(
        helpRow(`prefix:${prefix}`, source.id, `${prefix}  ${source.label}`, source.hint, {
          kind: "prefix",
          prefix,
        }),
      );
    }
    for (const { key, hint } of source.keys ?? []) {
      if (term.length > 0 && !key.includes(term) && !source.label.toLowerCase().includes(term)) {
        continue;
      }
      rows.push(
        helpRow(`prefix:${prefix}${key}`, source.id, `${prefix}  ${key}`, hint, {
          kind: "query",
          query: key,
          scope: source.id,
        }),
      );
    }
    return rows;
  });

  return { source: "commands", label: `${HELP_PREFIX} Prefixes`, rows, total: rows.length };
}

function helpRow(
  id: string,
  source: PaletteSourceId,
  name: string,
  hint: string,
  target: PaletteTarget,
): RankedRow {
  return {
    row: { id, source, name, path: "", trailing: hint, icon: null, target },
    band: 0,
    score: 0,
    nameRanges: NO_RANGES,
    pathRanges: NO_RANGES,
  };
}
