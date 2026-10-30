import { useCallback } from "react";

import type { SetFile, SiteRow } from "@/lib/tauri";

import { rowKey } from "../../bin/tree/utils/binRows";
import { objectDocument, previewDocument } from "../../documents/utils/contentDocument";
import { useOpenDocumentAs, useRevealRow } from "../../state";
import { useFocusRule } from "../state/voiceLines";

/**
 * Returns a function that opens the object tab of `row` and reveals its row.
 *
 * The object tab opens the way a References row opens it. A row whose bin no store contains opens
 * nothing.
 */
export function useOpenSiteRow(): (row: SiteRow) => void {
  const open = useOpenDocumentAs();
  const revealRow = useRevealRow();

  return useCallback(
    (row) => {
      if (row.asset === null) return;

      const document = objectDocument(row.asset, row.objectHash, row.object, row.bin, row.class);
      open(document, "default");
      if (row.property !== null) {
        revealRow(document.id, rowKey({ entry: row.objectHash, path: row.property.path }));
      }
    },
    [open, revealRow],
  );
}

/** Returns a function that opens the audio file document of `file`. A missing file opens nothing. */
export function useOpenSetFile(): (file: SetFile) => void {
  const open = useOpenDocumentAs();

  return useCallback(
    (file) => {
      if (file.asset !== null) open(previewDocument(file.asset, file.path), "default");
    },
    [open],
  );
}

/**
 * Returns a function that opens the object tab of the contextual rule at `row` in its Voice lines
 * view, with the rule selected. A row whose bin no store contains opens nothing.
 */
export function useOpenVoiceLine(): (row: SiteRow) => void {
  const open = useOpenDocumentAs();
  const focus = useFocusRule();

  return useCallback(
    (row) => {
      if (row.asset === null || row.property === null) return;

      focus(row.objectHash, row.property.path);
      open(objectDocument(row.asset, row.objectHash, row.object, row.bin, row.class), "default");
    },
    [focus, open],
  );
}
