import type { BackendRankedSourceId, LocalSourceId, PaletteSourceId } from "./types";

interface SourceDeclaration {
  /** The group header, and the chip a scope draws before the caret. */
  readonly label: string;
  /** Typed at the start of a query to scope to this source, where one exists. */
  readonly prefix?: string;
  /** A second character reaching the same source, which `?` does not list. */
  readonly altPrefix?: string;
  /**
   * Rows an unscoped group shows before the rest become a count.
   *
   * `GROUP_CAP` unless a source says otherwise. Commands take fewer, because a
   * listing leads with them and someone reading for what they can do is served
   * by the first few. The rest are one scope away.
   */
  readonly cap?: number;
  /** What the source holds, for the row `?` lists it under. */
  readonly hint: string;
  /** The terms the source reads specially, for the rows `?` lists under its prefix. */
  readonly keys?: readonly SourceKey[];
  /** The source whose prefix also reaches this one, which carries none of its own. */
  readonly scopedWith?: PaletteSourceId;
}

/** One `key:` term a source reads, and what it narrows to. */
export interface SourceKey {
  /** The term as typed, colon included. */
  readonly key: string;
  readonly hint: string;
}

interface LocalSource extends SourceDeclaration {
  readonly id: LocalSourceId;
  readonly backendRanked?: false;
}

interface BackendRankedSource extends SourceDeclaration {
  readonly id: BackendRankedSourceId;
  readonly backendRanked: true;
}

export type PaletteSource = LocalSource | BackendRankedSource;

/**
 * Every source the bar reads, in the order its groups stack.
 *
 * Files, layers, documents and the game carry no prefix. `Tab` on a row reaches
 * those, and a prefix for each would be a table nobody can hold in their head.
 * The game is last but one because it is a source that costs a scan of the
 * install, so a project of one’s own always reads first. Objects come after
 * it, capped low unscoped so a modder typing a skin's name meets the object
 * beside the file without being told `$` exists. The project's own objects
 * stand just before the install's, which is the tiebreak `compareGroups`
 * falls to when both found equally good rows.
 *
 * Projects leads, because it is the one source both contexts hold and the only
 * row that can leave the surface the bar is drawn over.
 */
export const PALETTE_SOURCES: readonly PaletteSource[] = [
  {
    id: "projects",
    label: "Projects",
    prefix: "/",
    altPrefix: "~",
    hint: "Every project of the workshop",
  },
  { id: "documents", label: "Documents", hint: "The open tabs" },
  { id: "files", label: "Files", hint: "Every file of every layer" },
  { id: "layers", label: "Layers", hint: "The layers of this project" },
  { id: "strings", label: "Strings", prefix: "#", hint: "Every string override key" },
  { id: "commands", label: "Commands", prefix: ">", cap: 5, hint: "What the editor can do" },
  { id: "settings", label: "Settings", hint: "Every setting a link can open" },
  { id: "game", label: "Game", hint: "Every file of the installed game", backendRanked: true },
  {
    id: "projectObjects",
    label: "Objects",
    cap: 4,
    hint: "Every bin object this project declares",
    scopedWith: "objects",
  },
  {
    id: "objects",
    label: "Objects",
    prefix: "$",
    cap: 4,
    hint: "Every bin object the installed game declares",
    keys: [{ key: "class:", hint: "Narrow to a class, by name prefix or by hex" }],
    backendRanked: true,
  },
];

/** Every source a project's bar reads, which is all of them. */
export const PROJECT_SOURCES: readonly PaletteSourceId[] = PALETTE_SOURCES.map(
  (source) => source.id,
);

/**
 * What the bar reads with no project open.
 *
 * The game is absent: a game row has no editor to open into from this surface.
 */
export const WORKSHOP_SOURCES: readonly PaletteSourceId[] = ["projects", "commands", "settings"];

/** The prefix that lists the other prefixes, rather than scoping to a source. */
export const HELP_PREFIX = "?";

/** How many rows a source contributes before the rest fold into one more row. */
const GROUP_CAP = 8;

/** How many rows one source shows once it is the only source. */
const SCOPED_CAP = 200;

/** How many rows this source shows, alone under a scope or sharing the list. */
export function sourceCap(source: PaletteSource, scope: PaletteSourceId | null): number {
  return scope === null ? (source.cap ?? GROUP_CAP) : SCOPED_CAP;
}

export function paletteSource(id: PaletteSourceId): PaletteSource {
  const source = PALETTE_SOURCES.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Unknown palette source: ${id}`);
  return source;
}

export interface ParsedQuery {
  /** The source the box is narrowed to, or null while it reads every one. */
  readonly scope: PaletteSourceId | null;
  /** True while the query is a bare `?`, which lists the prefixes. */
  readonly help: boolean;
  /** What the matcher sees, trimmed and lowercased. */
  readonly term: string;
  /** The text as typed, after the `?` under help, which a completion rewrites. */
  readonly query: string;
}

/**
 * The source a leading prefix names, or null for a query that carries none.
 *
 * The bar turns this into a chip as the character is typed, so a scope reached
 * by a prefix and one reached by `Tab` are the same state afterwards.
 */
export function prefixScope(raw: string): PaletteSourceId | null {
  const source = PALETTE_SOURCES.find((candidate) => opensWithPrefix(raw, candidate));
  return source?.id ?? null;
}

function opensWithPrefix(raw: string, source: PaletteSource): boolean {
  if (source.prefix !== undefined && raw.startsWith(source.prefix)) return true;
  return source.altPrefix !== undefined && raw.startsWith(source.altPrefix);
}

/** Split what the user typed into the help flag and the term to match on. */
export function parseQuery(raw: string, scope: PaletteSourceId | null): ParsedQuery {
  if (scope === null && raw.startsWith(HELP_PREFIX)) {
    const query = raw.slice(1);
    return { scope: null, help: true, term: query.trim().toLowerCase(), query };
  }
  return { scope, help: false, term: raw.trim().toLowerCase(), query: raw };
}
