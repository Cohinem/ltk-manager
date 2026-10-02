import { DotsSixVerticalIcon } from "@phosphor-icons/react";
import { createPortal } from "react-dom";

import type { RowDrag } from "./useRowDrag";

/** Space between the pointer and the ghost, so the pointer still shows where it lands. */
const OFFSET = 14;

/** The dragged mod's name, following the pointer. Drawn over the page, so no frame clips it. */
export function RowDragGhost({ drag }: { drag: RowDrag }) {
  return createPortal(
    <div
      aria-hidden="true"
      style={{ left: drag.x + OFFSET, top: drag.y + OFFSET }}
      className="pointer-events-none fixed z-50 flex max-w-72 items-center gap-1.5 rounded-md border border-surface-600 bg-surface-800 py-1 pr-2.5 pl-1.5 text-sm font-medium text-surface-100 shadow-lg select-none"
    >
      <DotsSixVerticalIcon weight="bold" className="size-4 shrink-0 text-surface-400" />
      <span className="truncate">{drag.name}</span>
    </div>,
    document.body,
  );
}
