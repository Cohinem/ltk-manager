import type { Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { InstalledMod } from "@/lib/tauri";
import { useMoveModToFolder, useReorderMods } from "@/modules/library/api";

import type { TableRow } from "./rows";

/** How far a press travels before it is a drag rather than the press that switches the mod. */
const DRAG_THRESHOLD = 4;

/** How near the top or bottom edge a drag scrolls the table, and its fastest step per frame. */
const EDGE = 48;
const MAX_STEP = 18;

const ROOT_FOLDER_ID = "root";

const folderOf = (mod: InstalledMod) => mod.folderId ?? ROOT_FOLDER_ID;

/** Where a dragged row lands: beside another mod, in that mod's folder, or into a folder heading. */
export type RowDrop =
  | { kind: "beside"; modId: string; after: boolean; folderId: string; line: number }
  | { kind: "into"; folderId: string; rowKey: string };

export interface RowDrag {
  modId: string;
  name: string;
  /** The pointer, in viewport coordinates, which the ghost follows. */
  x: number;
  y: number;
  drop: RowDrop | null;
}

/** The load order once `modId` lands beside another mod. */
export function landedOrder(
  order: string[],
  modId: string,
  drop: Pick<Extract<RowDrop, { kind: "beside" }>, "modId" | "after">,
): string[] {
  const next = order.filter((id) => id !== modId);
  next.splice(next.indexOf(drop.modId) + (drop.after ? 1 : 0), 0, modId);
  return next;
}

interface RowDragArgs {
  rows: TableRow[];
  /** Every mod in load order. */
  mods: InstalledMod[];
  enabled: boolean;
  /** Whether a drop may file the mod into another folder, which only folder headings show. */
  crossFolders: boolean;
  scrollerRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** The sticky header's height, which the top scroll edge sits under. */
  topInset: number;
}

interface Press {
  mod: InstalledMod;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  drop: RowDrop | null;
  frame: number;
  release: () => void;
}

/**
 * Dragging a row to change the load order, or to file the mod into a folder.
 *
 * Pointer events rather than HTML drag and drop, which the window's own file
 * drop takes. A press that never travels is the row's switch, and `consumeClick`
 * tells the row which one it was. Per "Load order in the table" in
 * docs/ux/LIBRARY.md.
 */
export function useRowDrag(args: RowDragArgs) {
  const live = useRef(args);
  live.current = args;

  const [drag, setDrag] = useState<RowDrag | null>(null);
  const press = useRef<Press | null>(null);
  const dragged = useRef(false);

  const { mutate: reorder } = useReorderMods();
  const { mutate: moveToFolder } = useMoveModToFolder();

  const dropAt = useCallback((clientY: number, mod: InstalledMod): RowDrop | null => {
    const { rows, virtualizer, scrollerRef, crossFolders } = live.current;
    const scroller = scrollerRef.current;
    if (!scroller) return null;

    const offset = clientY - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const item = virtualizer.getVirtualItemForOffset(offset);
    const row = item ? rows[item.index] : undefined;
    if (!item || !row) return null;

    if (row.type === "group") {
      if (!row.folder || !crossFolders || row.folder.id === folderOf(mod)) return null;
      return { kind: "into", folderId: row.folder.id, rowKey: row.key };
    }

    if (row.mod.id === mod.id) return null;

    const folderId = folderOf(row.mod);
    if (!crossFolders && folderId !== folderOf(mod)) return null;

    const after = offset >= item.start + item.size / 2;
    return {
      kind: "beside",
      modId: row.mod.id,
      after,
      folderId,
      line: after ? item.end : item.start,
    };
  }, []);

  const land = useCallback(
    (mod: InstalledMod, drop: RowDrop) => {
      if (drop.kind === "into") {
        moveToFolder({ modId: mod.id, folderId: drop.folderId });
        return;
      }

      const current = live.current.mods.map((candidate) => candidate.id);
      const order = landedOrder(current, mod.id, drop);

      if (drop.folderId !== folderOf(mod)) {
        moveToFolder(
          { modId: mod.id, folderId: drop.folderId },
          { onSuccess: () => reorder(order) },
        );
        return;
      }

      if (order.some((id, index) => id !== current[index])) reorder(order);
    },
    [moveToFolder, reorder],
  );

  const end = useCallback(
    (commit: boolean) => {
      const current = press.current;
      if (!current) return;

      press.current = null;
      current.release();
      cancelAnimationFrame(current.frame);
      setDrag(null);

      if (!current.started) return;

      /* The click follows the release before any timer runs, and a release over
         another row sends no click at all, so the flag clears itself. */
      dragged.current = true;
      setTimeout(() => {
        dragged.current = false;
      }, 0);
      if (commit && current.drop) land(current.mod, current.drop);
    },
    [land],
  );

  const onRowPointerDown = useCallback(
    (event: React.PointerEvent, mod: InstalledMod) => {
      if (!live.current.enabled || press.current) return;
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
      if ((event.target as HTMLElement).closest("[data-no-row]")) return;

      const update = (current: Press) => {
        current.drop = dropAt(current.y, current.mod);
        setDrag({
          modId: current.mod.id,
          name: current.mod.displayName,
          x: current.x,
          y: current.y,
          drop: current.drop,
        });
      };

      const scrollNearEdge = () => {
        const current = press.current;
        const scroller = live.current.scrollerRef.current;
        if (!current || !scroller) return;

        const box = scroller.getBoundingClientRect();
        const top = box.top + live.current.topInset + EDGE;
        const bottom = box.bottom - EDGE;
        const reach = current.y < top ? current.y - top : Math.max(0, current.y - bottom);
        if (reach !== 0) {
          scroller.scrollTop +=
            Math.sign(reach) * Math.min(MAX_STEP, (Math.abs(reach) / EDGE) * MAX_STEP);
          update(current);
        }
        current.frame = requestAnimationFrame(scrollNearEdge);
      };

      const onMove = (move: PointerEvent) => {
        const current = press.current;
        if (!current) return;

        current.x = move.clientX;
        current.y = move.clientY;
        if (!current.started) {
          const travel = Math.hypot(move.clientX - current.startX, move.clientY - current.startY);
          if (travel < DRAG_THRESHOLD) return;

          current.started = true;
          current.frame = requestAnimationFrame(scrollNearEdge);
        }
        update(current);
      };
      const onUp = () => end(true);
      const onCancel = () => end(false);
      const onKey = (key: KeyboardEvent) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        end(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, { capture: true });

      press.current = {
        mod,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        started: false,
        drop: null,
        frame: 0,
        release: () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onCancel);
          window.removeEventListener("keydown", onKey, { capture: true });
        },
      };
    },
    [dropAt, end],
  );

  useEffect(() => () => end(false), [end]);

  /** Whether the click a drag ends on is the drag's, so it must not also switch the mod. */
  const consumeClick = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  /** Whether a row is being dragged now, so hovering rows previews nothing. */
  const isDragging = useCallback(() => press.current?.started === true, []);

  return { drag, onRowPointerDown, consumeClick, isDragging };
}
