import { useCallback, useRef, useState } from "react";

/** How far a press travels before it is a drag rather than a click that sorts. */
const DRAG_THRESHOLD = 4;

export interface ColumnDrag<Id extends string> {
  id: Id;
  /** How far the pointer has moved since the press, which the dragged header follows. */
  offset: number;
  /** The column the dragged one lands before. */
  before: Id;
  /** Where the landing line is drawn, from the header row's left edge. */
  indicator: number;
  /** Whether landing there would leave the order as it is. */
  idle: boolean;
}

/**
 * Reordering columns by dragging their headers, on pointer events.
 *
 * HTML drag and drop never reaches the page in this window, because the
 * window's own file drop takes it for importing mods, so the drag is tracked by
 * hand. `movable` is the visible columns that may move, in drawn order, and
 * `tail` is the pinned column a drop past the last of them lands before.
 */
export function useColumnDrag<Id extends string>(
  movable: Id[],
  tail: Id,
  onMove: (id: Id, before: Id) => void,
) {
  const [drag, setDrag] = useState<ColumnDrag<Id> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<Id, HTMLElement>());
  const press = useRef<{ id: Id; x: number } | null>(null);
  const dragged = useRef(false);

  const cellRef = useCallback(
    (id: Id) => (element: HTMLElement | null) => {
      if (element) cells.current.set(id, element);
      else cells.current.delete(id);
    },
    [],
  );

  function landing(id: Id, x: number) {
    const row = rowRef.current?.getBoundingClientRect();
    if (!row) return null;

    const boxes = movable.flatMap((candidate) => {
      const box = cells.current.get(candidate)?.getBoundingClientRect();
      return box ? [{ id: candidate, box }] : [];
    });
    const target = boxes.find(({ box }) => x < box.left + box.width / 2);
    const before = target?.id ?? tail;
    const edge = target ? target.box.left : (boxes.at(-1)?.box.right ?? row.left);

    const next = movable[movable.indexOf(id) + 1] ?? tail;
    return { before, indicator: edge - row.left, idle: before === id || before === next };
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>, id: Id) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[role=separator]")) return;

    press.current = { id, x: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const start = press.current;
    if (!start) return;

    const offset = event.clientX - start.x;
    if (!drag && Math.abs(offset) < DRAG_THRESHOLD) return;

    const land = landing(start.id, event.clientX);
    if (land) setDrag({ id: start.id, offset, ...land });
  }

  function onPointerUp() {
    press.current = null;
    if (!drag) return;

    dragged.current = true;
    if (!drag.idle) onMove(drag.id, drag.before);
    setDrag(null);
  }

  function onPointerCancel() {
    press.current = null;
    setDrag(null);
  }

  /** Whether the click a drag ends on is the drag's, so it must not also sort. */
  function consumeClick() {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }

  return {
    drag,
    rowRef,
    cellRef,
    consumeClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
