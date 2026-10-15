import type { ReactNode } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { FieldRow, ValueCell } from "../../../classes/components/ClassCells";
import { useCurveChain, useCurveDock } from "../../../curves/state/curveTarget";
import { valueShape } from "../utils/curveShape";
import type { ValueItem } from "../utils/graphItems";
import { valueSummary } from "../utils/nodeText";
import { CurvePicture, MarkedCurve } from "./PlateFace";

/* DS-GROUND, DS-VEIL, DS-RADIUS */
export const CURVE_WELL = "rounded-sm border border-surface-veil bg-surface-950/40";

/**
 * A keyed or randomised value's field row: its name, its curve as a strip that opens it in the
 * curve pane, and its mode toggle. The graph's sockets and the inspector both draw it.
 */
export function ValueRow({
  item,
  row,
  label,
  owner,
  width,
  rail,
  action,
}: {
  item: ValueItem;
  row: BinRow;
  label: string;
  owner: string | null;
  width: string;
  /** The roll rail's segment, which only the inspector draws. */
  rail?: ReactNode;
  /** What follows the mode toggle, such as the graph's pop-out button. */
  action?: ReactNode;
}) {
  const { aim } = useCurveDock();
  const chain = useCurveChain(row.name);

  return (
    <FieldRow
      row={row}
      label={label}
      tableLayout
      width={width}
      owner={owner}
      rail={rail}
      valueSlot={
        <>
          <Tooltip content={m.workshop_bin_force_curve_action()}>
            <button
              type="button"
              aria-label={m.workshop_bin_force_curve_action()}
              className={twMerge(
                CURVE_WELL,
                "h-5 min-w-0 flex-1 cursor-pointer px-1 py-0.5 hover:border-accent-hover",
              )}
              onClick={() => aim({ row, chain })}
            >
              <ValueStrip item={item} />
            </button>
          </Tooltip>
          <span className="flex shrink-0 items-center">
            <ValueCell row={row} controls chip={false} />
          </span>
        </>
      }
      valueAction={action}
    />
  );
}

/** A value's curve stretched to a one-line strip, or its summary where it has none to draw. */
function ValueStrip({ item }: { item: ValueItem }) {
  const shape = valueShape(item);
  if (shape === "band" && item.curve.keys.length === 0) {
    return <CurvePicture curve={item.curve} shape="band" />;
  }
  if (shape !== null) return <MarkedCurve item={item} shape={shape} />;

  return (
    <span className="block truncate text-left text-meta text-surface-400">
      {valueSummary(item)}
    </span>
  );
}
