import { previewFontUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { readSfntMetrics, type SfntMetrics } from "./sfnt";

/** A font file loaded into the webview, which a canvas draws with by its family. */
export interface LoadedFont {
  readonly family: string;
  readonly metrics: SfntMetrics;
}

const NO_METRICS = "The font has no head or hhea table";

const loads = new Map<string, Promise<LoadedFont>>();

/** The key a file loads under, which a font, a fill and an icon texture are held by. */
export function assetKey(asset: AssetRef): string {
  return JSON.stringify(asset);
}

/**
 * The font file `asset`, fetched through the scheme's font form, measured, and added to the
 * document's fonts under a family of its own. Each file loads once per session.
 */
export function loadFont(asset: AssetRef): Promise<LoadedFont> {
  const key = assetKey(asset);
  const held = loads.get(key);
  if (held !== undefined) return held;

  const load = (async () => {
    const response = await fetch(previewFontUrl(asset));
    if (!response.ok) throw new Error(await response.text());

    const bytes = await response.arrayBuffer();
    const metrics = readSfntMetrics(bytes);
    if (metrics === null) throw new Error(NO_METRICS);

    const family = `atlas-font-${loads.size}`;
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
    return { family, metrics };
  })();
  loads.set(key, load);
  load.catch(() => loads.delete(key));
  return load;
}
