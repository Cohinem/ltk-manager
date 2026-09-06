import { useCallback } from "react";

import type { AssetRef } from "@/lib/tauri";

import { previewDocument } from "../documents/contentDocument";
import type { OpenIntent } from "../palette/types";
import { useOpenDocumentAs, useRevealObject } from "../state";

/**
 * Open the declaring file's tab scrolled to one object.
 *
 * The tab is keyed on the file. A file tab that is open activates and scrolls
 * rather than opening twice. `file` is the chunk's resolved path for a game chunk,
 * which the reference itself cannot carry.
 */
export function useShowInFile() {
  const open = useOpenDocumentAs();
  const revealObject = useRevealObject();

  return useCallback(
    (asset: AssetRef, objectHash: string, file: string, intent: OpenIntent = "default") => {
      const resolved = asset.kind === "gameChunk" && file.length > 0 ? file : undefined;
      const document = previewDocument(asset, resolved);
      open(document, intent);
      revealObject(document.id, objectHash);
    },
    [open, revealObject],
  );
}
