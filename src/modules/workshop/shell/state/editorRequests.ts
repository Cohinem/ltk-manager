import type { BinRow } from "@/lib/tauri";

/** An outline's request that one layer's file tree scroll to an entry. */
export interface RevealRequest {
  readonly layerName: string;
  /** Path relative to the layer root, spelled as a content entry spells it. */
  readonly path: string;
  /** Bumped per request, so asking twice for the same entry still scrolls. */
  readonly token: number;
}

/** A request that one open bin or object tab expand down to a row and scroll to it. */
export interface RowRevealRequest {
  readonly documentId: string;
  /** The row's key: its object's hash, a colon, and its wire path, empty for the object. */
  readonly key: string;
  /** Bumped per request. A second request for the same row is a second scroll. */
  readonly token: number;
}

/** A row menu's request that one open rules document sit on a line. */
export interface IgnoreLineRevealRequest {
  readonly documentId: string;
  /** One-based, as the document's own gutter counts. */
  readonly line: number;
  /** Bumped per request. Asking twice for the same line is two moves. */
  readonly token: number;
}

/** A bin value's request that one open strings document take up a string-table key. */
export interface StringKeyAimRequest {
  readonly documentId: string;
  readonly key: string;
  /** What the game says for the key today, which an override starts from. */
  readonly line: string;
  /** Bumped per request. Aiming twice at one key is two aims. */
  readonly token: number;
}

/**
 * A file tab's request that one object tab open with its dock on a row.
 *
 * The row travels rather than its key, because the dock reads the row itself and the
 * tab receiving it has not read that far down its own tree.
 */
export interface CurveAimRequest {
  readonly documentId: string;
  readonly row: BinRow;
  /** The labels the caption hangs off, which the surface that was clicked names. */
  readonly chain: string;
  /** Bumped per request. Aiming twice at one row is two aims. */
  readonly token: number;
}
