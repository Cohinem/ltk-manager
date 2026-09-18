import type { ContentDocument } from "../../documents/utils/contentDocument";

/** How many closed tabs a reopen reaches back through, per shell. */
export const CLOSED_LIMIT = 20;

/** What one closed tab left behind, in the project it was closed in. */
export interface ClosedTab extends ClosedDocument {
  readonly project: string;
}

/** One closed tab, enough of it to put back where it was. */
export interface ClosedDocument {
  readonly document: ContentDocument;
  /** The group it was closed from, which a reopen prefers while it stands. */
  readonly leafId: string;
  /** Whether it led its strip, which a reopen gives back. */
  readonly pinned: boolean;
}
