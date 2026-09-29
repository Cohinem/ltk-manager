import { useMemo } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import { FULL_SAFE_ZONE, type LayoutSettings, solve } from "../engine/layout/solve";
import { SAFE_ZONE_INSET, useFrameSettings, useScreenPreset } from "../state/atlasPreview";
import { useAtlasView, type ViewSource } from "./useAtlasSources";

/** A view laid out for the chosen screen, HUD scale and safe zone. */
export function useAtlasLayout(
  document: BinDocumentId,
  entry: string,
  source: ViewSource = "controller",
) {
  const { view, tree, error, pending } = useAtlasView(document, entry, source);
  const screen = useScreenPreset();
  const { hud, safeZone } = useFrameSettings();

  const settings = useMemo<LayoutSettings>(
    () => ({
      screen: { width: screen.width, height: screen.height },
      hud,
      safeZone: safeZone
        ? {
            x0: SAFE_ZONE_INSET,
            y0: SAFE_ZONE_INSET,
            x1: 1 - SAFE_ZONE_INSET,
            y1: 1 - SAFE_ZONE_INSET,
          }
        : FULL_SAFE_ZONE,
    }),
    [screen.width, screen.height, hud, safeZone],
  );
  const solved = useMemo(() => (tree === null ? null : solve(tree, settings)), [tree, settings]);

  return { view, tree, error, pending, screen, settings, solved };
}
