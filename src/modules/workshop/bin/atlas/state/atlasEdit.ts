import { createContext, use } from "react";

import type { AssetRef, BinDocumentId, NewObject, PropertyEdit, ReadOnly } from "@/lib/tauri";

/** Where a view's edits land, per "Edits through `bin_edit`" in docs/plans/atlas-ui-editor.md. */
export interface AtlasEdit {
  /** The open scene bin the view draws, null while it opens. */
  readonly scene: BinDocumentId | null;
  /** The open declared variant drawn over the scene bin, which takes the edits while drawn. */
  readonly variant: BinDocumentId | null;
  readonly asset: AssetRef | null;
  /** Whether the scene bin takes edits, which a read-only open or sandbox refuses. */
  readonly editable: boolean;
  /** Why the scene bin takes no edits, where the open reports why. */
  readonly readOnly: ReadOnly | null;
  /** Send `edits` as one undo step, answering whether they landed. A refusal is a toast. */
  readonly apply: (edits: readonly PropertyEdit[]) => Promise<boolean>;
  /** Declare the object `name` from `origin`, answering its entry, or null where it was refused. */
  readonly create: (name: string, origin: NewObject) => Promise<string | null>;
  /**
   * Declare the removal of each object of `entries`, one undo step apiece, answering whether all
   * were removed. A refusal is a toast, and the objects after it stay.
   */
  readonly remove: (entries: readonly string[]) => Promise<boolean>;
}

/** The edits of the enclosing Atlas shell, null outside one. */
export const AtlasEditContext = createContext<AtlasEdit | null>(null);

export function useAtlasEdit(): AtlasEdit | null {
  return use(AtlasEditContext);
}

/** The open scene bin the enclosing shell draws its view from, null outside one or while it opens. */
export function useAtlasScene(): BinDocumentId | null {
  return use(AtlasEditContext)?.scene ?? null;
}

/** The open declared variant the enclosing shell draws, null where none is open. */
export function useAtlasVariant(): BinDocumentId | null {
  return use(AtlasEditContext)?.variant ?? null;
}
