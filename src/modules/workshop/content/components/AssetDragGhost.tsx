import { createPortal } from "react-dom";

import { useAssetDrag } from "../state/assetDrag";

/** The path a content drag carries, beside the pointer until the release. */
export function AssetDragGhost() {
  const drag = useAssetDrag();
  if (drag === null) return null;

  const name = drag.path.slice(drag.path.lastIndexOf("/") + 1);
  return createPortal(
    <div
      data-ui="AssetDragGhost"
      className="pointer-events-none fixed z-50 max-w-64 truncate rounded-sm border border-accent-500/60 bg-surface-800 px-1.5 py-0.5 font-mono text-code text-surface-100 shadow-lg select-none"
      style={{ left: drag.x + 12, top: drag.y + 8 }}
    >
      {name}
    </div>,
    document.body,
  );
}
