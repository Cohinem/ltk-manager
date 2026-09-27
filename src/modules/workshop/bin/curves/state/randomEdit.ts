import { createContext, use, useMemo } from "react";

import type { BinRow } from "@/lib/tauri";

import type { LeafEdit } from "../../tree/hooks/useLeafEdit";
import { CURVE_DYNAMICS } from "../utils/curveEdits";
import { type ChannelDraw, type RandomDraw, sameDraw } from "../utils/randomDraw";
import { tableEdits, type TableKey } from "../utils/randomEdits";

/** What a lane or a readout row writes its channel's table through. */
export interface RandomEdit {
  /** Write `keys` over the table of `channel` and of every channel it reaches. */
  readonly write: (channel: ChannelDraw, keys: readonly TableKey[]) => void;
  /** The channels an edit of `channel` writes: itself, and those linked to it. */
  readonly reach: (channel: ChannelDraw) => readonly number[];
}

export const RandomEditContext = createContext<RandomEdit | null>(null);

/** The table editor of the reading, and null where the value cannot be written. */
export function useRandomEdit(): RandomEdit | null {
  return use(RandomEditContext);
}

/**
 * The editor for `draw` on `row`, and null where nothing may be written or the set is one
 * the game cannot read. Under `linked`, channels drawing one table over one base move
 * together, which is how a uniform scale stays uniform.
 */
export function useRandomEditor(
  edit: LeafEdit | null,
  row: BinRow,
  draw: RandomDraw | null,
  linked: boolean,
): RandomEdit | null {
  return useMemo(() => {
    const editProperty = edit?.editProperty;
    if (editProperty === undefined || draw === null || draw.broken) return null;

    const reached = (channel: ChannelDraw) =>
      draw.channels.filter(
        (each) =>
          each.channel === channel.channel ||
          (linked && each.table !== null && sameDraw(each, channel)),
      );
    return {
      reach: (channel) => reached(channel).map((each) => each.channel),
      write: (channel, keys) => {
        const edits = reached(channel).map((each) =>
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
