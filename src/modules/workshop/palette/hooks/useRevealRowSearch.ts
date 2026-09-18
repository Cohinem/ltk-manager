import { useCallback } from "react";

import { useOpenBin } from "../../state";
import { useRevealPalette } from "../state/paletteReveal";

/**
 * Where a find goes for a document with no search box of its own.
 *
 * The `@` scope reads the rows of the active bin or object tab, so it answers
 * for a document that holds one and for nothing else. A document with neither
 * a box nor rows leaves the key alone.
 */
export function useRevealRowSearch(documentId: string | null): () => void {
  const revealPalette = useRevealPalette();
  const bin = useOpenBin(documentId);

  return useCallback(() => {
    if (bin === null) return;
    revealPalette("rows");
  }, [bin, revealPalette]);
}
