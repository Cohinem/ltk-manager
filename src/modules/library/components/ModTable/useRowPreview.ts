import { useCallback, useEffect, useRef } from "react";

import { useLibrarySidebarStore, useLibraryTableStore } from "../../state";

/** How long a pointer heading for the dock may cross other rows before they take it. */
const HEADING_DELAY_MS = 110;

/** Whether the dock takes whatever row the pointer reaches. */
function dockFollows(): boolean {
  const { pinned, editing, dirty } = useLibrarySidebarStore.getState();
  return !pinned && !editing && !dirty && !useLibraryTableStore.getState().dockCollapsed;
}

/**
 * The dock's preview of the row under the pointer, which also becomes the current row.
 *
 * A row the pointer enters shows at once, unless the pointer is moving mostly
 * rightward toward the dock: then the rows it crosses on the way wait briefly,
 * so a diagonal path into the dock keeps the mod it started from.
 */
export function useRowPreview(setCurrent: (rowKey: string) => void) {
  const preview = useLibrarySidebarStore((s) => s.preview);
  const motion = useRef({ x: 0, y: 0, dx: 0, dy: 0 });
  const pending = useRef<number | undefined>(undefined);

  const show = useCallback(
    (rowKey: string, modId: string) => {
      if (!dockFollows()) return;
      setCurrent(rowKey);
      preview(modId);
    },
    [preview, setCurrent],
  );

  const onEnter = useCallback(
    (rowKey: string, modId: string) => {
      window.clearTimeout(pending.current);
      const { dx, dy } = motion.current;
      const headingToDock = dx > 2 && dx > 2 * Math.abs(dy);

      if (headingToDock && useLibrarySidebarStore.getState().modId !== null) {
        pending.current = window.setTimeout(() => show(rowKey, modId), HEADING_DELAY_MS);
        return;
      }
      show(rowKey, modId);
    },
    [show],
  );

  useEffect(() => () => window.clearTimeout(pending.current), []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const last = motion.current;
    motion.current = {
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - last.x,
      dy: event.clientY - last.y,
    };
  }, []);

  const onPointerLeave = useCallback(() => window.clearTimeout(pending.current), []);

  return { preview, onEnter, onPointerMove, onPointerLeave };
}
