import { useMemo, useState } from "react";

import { useResizeObserver } from "@/hooks";

import { nameColumn } from "../../../shared/utils/textCut";
import type { SystemModel } from "../../engine/model/model";
import { laneLabel } from "../components/LaneRow";
import { laneOrder } from "../utils/laneModel";

/** What a lane head holds beside its name and index, in pixels: the caret, square, M and S. */
const HEAD_EXTRA = 104;

/** The share of the pane past which a lane head cuts its names. */
const HEAD_CAP = 1 / 3;

/**
 * The width of the lane heads' column, as a CSS length, and the ref that measures the pane
 * it caps against.
 *
 * The length is in `ch`, which each element resolves in its own font, so every element sized
 * by it has to inherit the same font.
 */
export function useLaneHead(system: SystemModel | null) {
  const [pane, setPane] = useState(0);
  const measure = useResizeObserver<HTMLDivElement>((element) => setPane(element.clientWidth));

  /* A cap in pixels rather than a share, so the ruler's row and the scrolled rows under it,
     which a scrollbar narrows, draw one width. */
  const head = useMemo(
    () =>
      nameColumn(
        system === null ? [] : laneOrder(system).map(laneLabel),
        HEAD_EXTRA,
        pane > 0 ? `${Math.round(pane * HEAD_CAP)}px` : `${HEAD_CAP * 100}%`,
      ),
    [system, pane],
  );

  return { head, measure };
}
