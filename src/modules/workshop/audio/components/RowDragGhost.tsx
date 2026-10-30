import { createPortal } from "react-dom";

import { useRowDrag } from "../state/rowDrag";

/** The name of the row that the list `source` drags, beside the pointer until the release. */
export function RowDragGhost({ source }: { source: string }) {
  const drag = useRowDrag(source);
  if (drag === null) return null;

  return createPortal(
    <div
      data-ui="RowDragGhost"
      className="pointer-events-none fixed z-50 max-w-64 truncate rounded-sm border border-accent-500/60 bg-surface-800 px-1.5 py-0.5 text-meta text-surface-100 shadow-lg select-none"
      style={{ left: drag.x + 12, top: drag.y + 8 }}
    >
      {drag.label}
    </div>,
    document.body,
  );
}
