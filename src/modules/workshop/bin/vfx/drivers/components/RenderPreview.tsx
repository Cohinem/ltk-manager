import { use, useMemo } from "react";

import { VfxRunContext } from "../../playback/state/run";
import { renderPreviewHeight } from "../utils/driverLayout";
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

  return (
    <div
      className="flex shrink-0 items-start justify-center px-2"
      style={{ height: renderPreviewHeight(item) }}
    >
      {emitter === undefined ? (
        <FilePreview item={texture} />
      ) : (
        <LayerSurface emitter={emitter} only="base" />
      )}
    </div>
  );
}
