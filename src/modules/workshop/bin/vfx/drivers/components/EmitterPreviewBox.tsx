import { useState } from "react";

import { twMerge } from "@/utils";

import { PreviewViewStore } from "../utils/previewViews";
import { BackdropButton } from "./BackdropButton";
import { EmitterPreviewLayer } from "./EmitterPreview";
import { PreviewViewsContext } from "./PreviewView";
import { EmitterSurface } from "./SurfacePreview";

/**
 * An emitter's node preview outside the Graph pane, as wide as its container.
 *
 * The same `EmitterSurface` an emitter node draws, with a preview layer of its own, since
 * only the Graph pane hosts one, and the backdrop switch in its corner.
 */
export function EmitterPreviewBox({
  simple,
  listIndex,
  className,
}: {
  simple: boolean;
  listIndex: number;
  className?: string;
}) {
  const [views] = useState(() => new PreviewViewStore());

  return (
    <PreviewViewsContext value={views}>
      <div data-ui="EmitterPreviewBox" className={twMerge("relative", className)}>
        <EmitterSurface simple={simple} listIndex={listIndex} square />
        <EmitterPreviewLayer />
        {/* Over the preview layer at z-index 4. */}
        <BackdropButton className="absolute top-1 right-1 z-5" />
      </div>
    </PreviewViewsContext>
  );
}
