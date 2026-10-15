import { createContext, use, useMemo, useState } from "react";

import type { BinRow } from "@/lib/tauri";

import type { LeafEdit } from "../../tree/hooks/useLeafEdit";
import { CURVE_DYNAMICS } from "../utils/curveEdits";
import { type ChannelDraw, drawGroups, type RandomDraw } from "../utils/randomDraw";
import { tableEdits, type TableKey } from "../utils/randomEdits";

/** What a lane or a readout row writes its channel's table through. */
export interface RandomEdit {
  /** Writes `keys` over the table of `channel`, and over the tables of its group if `linked`. */
  readonly write: (channel: ChannelDraw, keys: readonly TableKey[]) => void;
  /** `true` if the channels that draw one table share one row and one edit. */
  readonly linked: boolean;
  readonly setLinked: (linked: boolean) => void;
}

export const RandomEditContext = createContext<RandomEdit | null>(null);

/** Returns the table editor of the reading, or null if the value cannot be written. */
export function useRandomEdit(): RandomEdit | null {
  return use(RandomEditContext);
}

/**
 * Returns the editor for `draw` on `row`. Channels start linked, so an edit of a uniform scale
 * keeps it uniform.
 *
 * Returns null if nothing may be written or the game cannot read the tables.
 */
export function useRandomEditor(
  edit: LeafEdit | null,
  row: BinRow,
  draw: RandomDraw | null,
): RandomEdit | null {
  const [linked, setLinked] = useState(true);

  return useMemo(() => {
    const editProperty = edit?.editProperty;
    if (editProperty === undefined || draw === null || draw.broken) return null;

    const groups = drawGroups(draw);
    const written = (channel: ChannelDraw) =>
      linked ? (groups.find((group) => group.includes(channel)) ?? [channel]) : [channel];
    return {
      linked,
      setLinked,
      write: (channel, keys) => {
        const edits = written(channel).map((each) =>
          tableEdits(each.channel, each.table?.keys.length ?? 0, keys),
        );
        if (edits.some((each) => each === null)) return;
        void editProperty(
          row,
          CURVE_DYNAMICS,
          edits.flatMap((each) => each ?? []),
        );
      },
    };
  }, [edit, row, draw, linked]);
}
