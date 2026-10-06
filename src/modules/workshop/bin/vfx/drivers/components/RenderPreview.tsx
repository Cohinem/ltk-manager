import { use, useMemo } from "react";

import { VfxRunContext } from "../../playback/state/run";
import { emitterOf } from "../utils/graphEmitter";
import type { RenderItem } from "../utils/graphItems";
import { renderTexture } from "../utils/renderSection";
import { FilePreview } from "./NodePreviews";
import { LayerSurface } from "./SurfacePreview";

/**
 * The Texture node's picture: the emitter's surface with its texture layer alone, played as
 * the emitter node's is, or the texture file where no run holds the emitter.
 */
export function RenderPreview({ item }: { item: RenderItem }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, item.id), [system, item.id]);
  const texture = renderTexture(item);
  if (texture === null) return null;

  if (emitter === undefined) return <FilePreview item={texture} />;
  return <LayerSurface emitter={emitter} only="base" />;
}
