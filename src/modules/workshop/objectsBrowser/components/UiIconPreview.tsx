import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { previewUrl } from "@/lib/previewUrl";
import { api, type BinDocumentId } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { spriteDataUrl } from "../../bin/atlas/utils/spriteImages";
import { EMPTY_OUTCOME, FAILED_OUTCOME, type PreviewOutcome } from "../state/previewStills";

/** The still's side in pixels: a tile's art at twice its drawn size. */
const STILL_SIZE = 256;

interface UiIconPreviewProps {
  document: BinDocumentId;
  entry: string;
  onOutcome: (outcome: PreviewOutcome) => void;
}

/**
 * A `UiElementIconData`'s sprite as a tile's still: the element resolved through its scene bin
 * and the manifest of the bin's folder, then its part of its texture cropped to a square. An icon
 * with no sprite it can reach settles empty. Draws nothing on the preview surface.
 */
export function UiIconPreview({ document, entry, onOutcome }: UiIconPreviewProps) {
  const view = useQuery(
    queryOptions({
      queryKey: ["object-preview", "ui-icon", document, entry],
      queryFn: queryFnWithArgs(api.bin.readUiSceneView, document, entry),
      gcTime: 0,
    }),
  );

  useEffect(() => {
    if (view.isError) {
      onOutcome(FAILED_OUTCOME);
      return;
    }
    if (view.data === undefined) return;

    const element = view.data.elements.find((each) => each.key === entry);
    const look = element?.look;
    const sprite = look?.kind === "icon" ? look.sprite : null;
    const asset = sprite === null ? null : (view.data.textures[sprite.texture]?.asset ?? null);
    if (look?.kind !== "icon" || sprite === null || asset === null) {
      onOutcome(EMPTY_OUTCOME);
      return;
    }

    const [u0 = 0, v0 = 0, u1 = 0, v1 = 0] = sprite.uv.map((edge) => edge ?? 0);
    let live = true;
    spriteDataUrl(previewUrl(asset), [u0, v0, u1, v1], STILL_SIZE, look.flip)
      .then((src) => {
        if (live) onOutcome({ kind: "image", src });
      })
      .catch(() => {
        if (live) onOutcome(FAILED_OUTCOME);
      });
    return () => {
      live = false;
    };
  }, [view.data, view.isError, entry, onOutcome]);

  return null;
}
