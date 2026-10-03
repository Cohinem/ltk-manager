import { memo, useEffect, useRef } from "react";

import {
  ArrangedCurrentRing,
  tableCellClass,
  tableCellStyle,
  tableContentClass,
  tableEdgeClass,
  tableRowFillClass,
} from "@/components";
import type { InstalledMod } from "@/lib/tauri";
import { twMerge } from "@/utils";

import type { RowDensity } from "../../state";
import { ModCardContextMenu, SkinhackInfoDialog } from "../ModCard/ModCardParts";
import { useModCardController } from "../ModCard/useModCardController";
import type { TableColumnSpec } from "./columns";

export interface ModTableRowProps {
  mod: InstalledMod;
  rowKey: string;
  columns: TableColumnSpec[];
  position: number;
  density: RowDensity;
  /** Whether this is the current row, the one the dock shows and the keys move from. */
  isCurrent: boolean;
  /** Whether the rows above and below are picked too, so the picks draw as one block. */
  joinTop: boolean;
  joinBottom: boolean;
  /** Offset from the top of the rows, from the virtualizer. */
  top: number;
  height: number;
  onPress: (event: React.MouseEvent, rowKey: string, modId: string) => void;
  /** The pointer reached the row, with the buttons it holds for a drag under way. */
  onEnter: (rowKey: string, modId: string, buttons: number) => void;
  /** Hands the table this row's switch, which a bare press and Space on the current row press. */
  register: (rowKey: string, toggle: (() => void) | null) => void;
  /** A press that may become a drag of this row to a new place in the load order. */
  onDragStart: (event: React.PointerEvent, mod: InstalledMod) => void;
  /** Whether this row is the one being dragged. */
  isDragged: boolean;
}

/**
 * One mod's row in the library table.
 *
 * A bare press switches the mod, as a card does, and makes it the current row.
 * Per "What a click does" in docs/ux/LIBRARY.md.
 */
export const ModTableRow = memo(function ModTableRow({
  mod,
  rowKey,
  columns,
  position,
  density,
  isCurrent,
  joinTop,
  joinBottom,
  top,
  height,
  onPress,
  onEnter,
  register,
  onDragStart,
  isDragged,
}: ModTableRowProps) {
  const view = useModCardController({ mod, viewMode: "list" });

  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    register(rowKey, () => {
      const current = viewRef.current;
      if (current.disabled) return;
      current.onToggle(current.mod.id, !current.mod.enabled);
    });
    return () => register(rowKey, null);
  }, [register, rowKey]);

  function handleClick(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest("[data-no-row]")) return;
    onPress(event, rowKey, mod.id);
  }

  /* An off mod recedes the way its grid card does, and a blocked one is
     dimmed by `cursorClass` already. */
  const recedes = !view.inEnabledState && !view.isSelected && !view.blocked;

  const row = (
    <div
      role="row"
      aria-selected={view.isSelected}
      aria-current={isCurrent || undefined}
      data-mod-id={mod.id}
      onClick={handleClick}
      onPointerDown={(event) => onDragStart(event, mod)}
      onPointerEnter={(event) => onEnter(rowKey, mod.id, event.buttons)}
      style={{
        height,
        transform: `translateY(${top}px)`,
        gridTemplateColumns: "var(--table-cols)",
      }}
      className={twMerge(
        "group/row absolute inset-x-0 top-0 grid items-stretch py-px text-row text-surface-400 select-none",
        joinTop && "pt-0",
        joinBottom && "pb-0",
        tableRowFillClass(isCurrent, view.isSelected),
        view.cursorClass,
        isDragged && "opacity-40",
      )}
    />
  );

  return (
    <ModCardContextMenu view={view} card={row}>
      {columns.map((column, index) => {
        const { Cell } = column;
        return (
          <div
            key={column.id}
            role="gridcell"
            style={tableCellStyle(column)}
            className={tableCellClass(
              column,
              tableEdgeClass(index, columns.length, joinTop, joinBottom),
            )}
          >
            <div className={tableContentClass(column, recedes)}>
              <Cell view={view} rowKey={rowKey} position={position} density={density} />
            </div>
          </div>
        );
      })}
      {isCurrent && <ArrangedCurrentRing className="inset-x-0 inset-y-px" />}
      <SkinhackInfoDialog open={view.skinhackInfoOpen} onOpenChange={view.setSkinhackInfoOpen} />
    </ModCardContextMenu>
  );
});
