import { useMemo } from "react";

import type { BinRow } from "@/lib/tauri";

import type { ValueItem } from "../utils/graphItems";
import { Line, NAME_COLUMN, NoteLine, RowMarks } from "./FieldLines";
import { EMBED_TONE, hueStyle, RowPlate } from "./NodeFrame";
import { PopOutButton } from "./SocketEmbed";
import { ValueRow } from "./ValueRow";

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
  if (row === undefined) return <NoteLine label={label} />;

  return (
    <RowMarks rows={shown} read="curves">
      <Line className={EMBED_TONE} style={hueStyle(item)} farFace menu={{ row, owner }}>
        <RowPlate item={item} />
        <div className="min-w-0 flex-1 overflow-hidden">
          <ValueRow
            item={item}
            row={row}
            label={label}
            owner={owner}
            width={NAME_COLUMN}
            action={<PopOutButton id={item.id} />}
          />
        </div>
      </Line>
    </RowMarks>
  );
}
