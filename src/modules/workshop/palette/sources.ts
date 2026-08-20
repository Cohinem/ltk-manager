import type { PaletteSourceId } from "./types";

export interface PaletteSource {
  readonly id: PaletteSourceId;
  /** The group header, and the chip a scope draws before the caret. */
  readonly label: string;
  /** Typed at the start of a query to scope to this source, where one exists. */
  readonly prefix?: string;
  /** What the source holds, for the row `?` lists it under. */
  readonly hint: string;
}

/**
 * Every source the bar reads, in the order its groups stack.
 *
 * Files, layers, documents and the game carry no prefix. `Tab` on a row reaches
 * those, and a prefix for each would be a table nobody can hold in their head.
 * The game is last because it is the one source that costs a scan of the
 * install, so a project of one’s own always reads first.
 */
export const PALETTE_SOURCES: readonly PaletteSource[] = [
  { id: "documents", label: "Documents", hint: "The open tabs" },
  { id: "files", label: "Files", hint: "Every file of every layer" },
  { id: "layers", label: "Layers", hint: "The layers of this project" },
  { id: "strings", label: "Strings", prefix: "#", hint: "Every string override key" },
  { id: "commands", label: "Commands", prefix: ">", hint: "What the editor can do" },
  { id: "game", label: "Game", hint: "Every file of the installed game" },
];

/** The prefix that lists the other prefixes, rather than scoping to a source. */
export const HELP_PREFIX = "?";

/** How many rows a source contributes before the rest fold into one more row. */
export const GROUP_CAP = 8;

/** How many rows one source shows once it is the only source. */
export const SCOPED_CAP = 200;

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
}

/**
 * The source a leading prefix names, or null for a query that carries none.
 *
 * The bar turns this into a chip as the character is typed, so a scope reached
 * by a prefix and one reached by `Tab` are the same state afterwards.
 */
export function prefixScope(raw: string): PaletteSourceId | null {
  const source = PALETTE_SOURCES.find(
    (candidate) => candidate.prefix !== undefined && raw.startsWith(candidate.prefix),
  );
  return source?.id ?? null;
}

/** Split what the user typed into the help flag and the term to match on. */
export function parseQuery(raw: string, scope: PaletteSourceId | null): ParsedQuery {
  if (scope === null && raw.startsWith(HELP_PREFIX)) {
    return { scope: null, help: true, term: raw.slice(1).trim().toLowerCase() };
  }
  return { scope, help: false, term: raw.trim().toLowerCase() };
}
