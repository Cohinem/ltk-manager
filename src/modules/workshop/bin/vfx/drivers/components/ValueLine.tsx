import { useMemo } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { FieldRow, ValueCell } from "../../../classes/components/ClassCells";
import { useCurveChain, useCurveDock } from "../../../curves/state/curveTarget";
import { valueShape } from "../utils/curveShape";
import type { ValueItem } from "../utils/graphItems";
import { valueSummary } from "../utils/nodeText";
import { Line, NAME_COLUMN, NoteLine, RowMarks } from "./FieldLines";
import { EMBED_TONE, hueStyle, RowPlate } from "./NodeFrame";
import { CurvePicture, MarkedCurve } from "./PlateFace";
import { PopOutButton } from "./SocketEmbed";

/* DS-GROUND, DS-VEIL, DS-RADIUS */
export const CURVE_WELL = "rounded-sm border border-surface-veil bg-surface-950/40";

/**
 * A keyed or randomised value drawn in the socket it feeds, on one line: its name, its curve
 * in the value column, its mode toggle and the button that pops it out to a node. A click on
 * the curve opens it in the curve pane. Under the far zoom it keeps its curve as `RowPlate`, as
 * its node would.
 */
export function ValueLine({
  item,
  row,
  label,
  owner,
}: {
  item: ValueItem;
  row: BinRow | undefined;
  label: string;
  owner: string | null;
}) {
  const shown = useMemo(() => (row === undefined ? [] : [row]), [row]);
  const { aim } = useCurveDock();
  const chain = useCurveChain(row?.name ?? "");
  if (row === undefined) return <NoteLine label={label} />;

  return (
    <RowMarks rows={shown} read="curves">
      <Line className={EMBED_TONE} style={hueStyle(item)} farFace menu={{ row, owner }}>
        <RowPlate item={item} />
        <div className="min-w-0 flex-1 overflow-hidden">
          <FieldRow
            row={row}
            label={label}
            tableLayout
            width={NAME_COLUMN}
            owner={owner}
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
            valueAction={<PopOutButton id={item.id} />}
          />
        </div>
      </Line>
    </RowMarks>
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
