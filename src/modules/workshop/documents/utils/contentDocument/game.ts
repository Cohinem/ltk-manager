import type { WadSource } from "@/lib/tauri";
import type { EditorDocumentBase } from "@/modules/editor";

/**
 * A browser document over one source's archives. Absent is the game, which is every document
 * written before the League client had a browser.
 */
interface SourceDoc extends EditorDocumentBase {
  source?: WadSource;
}

interface GameDoc extends SourceDoc {
  kind: "game";
}

/** The game has one root browser over one install, so its document needs nothing to key on. */
export const GAME_DOCUMENT_ID = "game";

/* The game's ids are the bare ones a saved layout already holds. */
function sourceId(source: WadSource, id: string): string {
  if (source === "game") return id;
  return id.replace(/^game/, source);
}

export function gameDocument(source: WadSource = "game"): GameDoc {
  return { id: sourceId(source, GAME_DOCUMENT_ID), kind: "game", ...sourcedBy(source) };
}

interface GameWadsDoc extends SourceDoc {
  kind: "game-wads";
}

/** The install has one set of archives per source, so its list needs nothing else to key on. */
export const GAME_WADS_DOCUMENT_ID = "game-wads";

export function gameWadsDocument(source: WadSource = "game"): GameWadsDoc {
  return { id: sourceId(source, GAME_WADS_DOCUMENT_ID), kind: "game-wads", ...sourcedBy(source) };
}

interface GameWadDoc extends SourceDoc {
  kind: "game-wad";
  wadName: string;
}

/* Keyed by archive name, so a second request for the same archive activates
   the tab that is already open. */
export function gameWadDocument(wadName: string, source: WadSource = "game"): GameWadDoc {
  return {
    id: sourceId(source, `game-wad:${wadName}`),
    kind: "game-wad",
    wadName,
    ...sourcedBy(source),
  };
}

/** The `source` field a document of `source` carries, none for the game. */
function sourcedBy(source: WadSource): Pick<SourceDoc, "source"> {
  if (source === "game") return {};
  return { source };
}

/** The archives a browser document reads. */
export function documentSource(document: SourceDoc): WadSource {
  return document.source ?? "game";
}

interface ObjectsDoc extends EditorDocumentBase {
  kind: "objects";
}

/** The install has one tree of objects. Its browser needs nothing to key on. */
export const OBJECTS_DOCUMENT_ID = "objects";

export function objectsDocument(): ObjectsDoc {
  return { id: OBJECTS_DOCUMENT_ID, kind: "objects" };
}

interface ReferencesDoc extends EditorDocumentBase {
  kind: "references";
}

/** One project answers one query at a time, so its document needs nothing to key on. */
export const REFERENCES_DOCUMENT_ID = "references";

export function referencesDocument(): ReferencesDoc {
  return { id: REFERENCES_DOCUMENT_ID, kind: "references" };
}

/** A browser over the installed game's archives or objects. */
export type GameBrowserDoc = GameDoc | GameWadsDoc | GameWadDoc | ObjectsDoc | ReferencesDoc;
