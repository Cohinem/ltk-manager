import { useCallback } from "react";

import type { AssetRef } from "@/lib/tauri";

import { previewDocument } from "../../../documents/utils/contentDocument";
import type { OpenIntent } from "../../../palette/utils/types";
import { useOpenDocumentAs, useRevealRow } from "../../../state";
import { objectKey } from "../../tree/utils/binRows";

/**
 * Open the declaring file's tab scrolled to one object.
 *
 * The tab is keyed on the file. A file tab that is open activates and scrolls
 * rather than opening twice. `file` is the chunk's resolved path for a game chunk,
 * which the reference itself cannot carry.
 */
export function useShowInFile() {
  const open = useOpenDocumentAs();
  const revealRow = useRevealRow();

  return useCallback(
    (asset: AssetRef, objectHash: string, file: string, intent: OpenIntent = "default") => {
      const resolved = asset.kind === "gameChunk" && file.length > 0 ? file : undefined;
      const document = previewDocument(asset, resolved);
      open(document, intent);
      revealRow(document.id, objectKey(objectHash));
    },
    [open, revealRow],
  );
}
