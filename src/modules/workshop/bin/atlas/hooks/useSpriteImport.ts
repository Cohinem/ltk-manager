import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

import { useToast } from "@/components";
import { errorSummary, m } from "@/i18n";
import { api, type BinDocumentId, type SheetSpec } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { sheetNameOf, sheetSpriteEdits } from "../engine/edit/spriteEdits";
import type { View } from "../engine/model/view";
import { useAtlasEdit } from "../state/atlasEdit";

const SHEET_KEY = "atlas-sheet";

export interface SpriteImport {
  /** Whether an import lands anywhere: the view's scene bin or variant is open and takes edits. */
  readonly available: boolean;
  readonly importing: boolean;
  /** The project's sheet for the view, null where it has none yet. */
  readonly sheet: SheetSpec | null;
  /**
   * Pick a PNG, put it on the view's sheet, and point every element of `elements` at it. `replace`
   * is the sheet sprite the image stands in for, which keeps its rect where the sizes agree.
   */
  readonly run: (elements: readonly string[], replace: string | null) => Promise<void>;
}

/**
 * Importing images onto the sheet the project owns for a view, per section 5 of
 * docs/plans/atlas-ui-editor.md. The page lands through the document edits go to, the variant
 * where one is drawn, and the repoint is one undo step there.
 */
export function useSpriteImport(view: View | null): SpriteImport {
  const edit = useAtlasEdit();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const document = edit?.variant ?? edit?.scene ?? null;
  const name = view === null ? null : sheetNameOf(view);
  const available = document !== null && name !== null && edit?.editable === true;

  const sheet = useQuery(sheetQuery(document, name));

  const run = useCallback(
    async (elements: readonly string[], replace: string | null) => {
      if (!available || edit === null || document === null || name === null) return;

      const file = await open({
        multiple: false,
        filters: [{ name: m.workshop_bin_atlas_sprites_png_filter(), extensions: ["png"] }],
      });
      if (typeof file !== "string") return;

      setImporting(true);
      try {
        const result = await api.bin.atlasImportSprite(document, name, file, replace);
        if (!result.ok) {
          toast.error(m.workshop_bin_atlas_sprites_import_failed(), errorSummary(result.error));
          return;
        }

        queryClient.setQueryData(sheetQuery(document, name).queryKey, result.value.sheet);
        if (elements.length > 0) {
          await edit.apply(sheetSpriteEdits(elements, result.value.sheet, result.value.sprite));
        }
      } finally {
        setImporting(false);
      }
    },
    [available, edit, document, name, toast, queryClient],
  );

  return { available, importing, sheet: sheet.data ?? null, run };
}

/** The project's sheet for the view named `name`, read through `document`'s project. */
function sheetQuery(document: BinDocumentId | null, name: string | null) {
  return queryOptions({
    queryKey: [SHEET_KEY, document, name] as const,
    queryFn: async () =>
      unwrapForQuery(await api.bin.atlasSheet(document as BinDocumentId, name ?? "")),
    enabled: document !== null && name !== null,
  });
}
