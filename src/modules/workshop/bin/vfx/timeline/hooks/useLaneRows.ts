import { useCallback, useMemo, useState } from "react";

import { toggledIn } from "@/utils";

import type { SystemModel } from "../../engine/model/model";
import type { Row } from "../components/LaneRow";
import {
  childLanes,
  laneBar,
  laneOrder,
  matchingLanes,
  periodCycles,
  type TimeWindow,
} from "../utils/laneModel";

/** Every cycle a bar's period opens, however far the view reaches, for the snap targets. */
const EVERY_CYCLE: TimeWindow = { from: 0, to: Number.POSITIVE_INFINITY };

/** What the lanes list under `filter`, and the emitters whose child lanes are unfolded. */
export interface LaneRows {
  readonly rows: readonly Row[];
  /** Every emitter's pool index in draw order, filtered or not. */
  readonly every: readonly number[];
  /** Every emitter's pool index the filter lists, in the order it lists them. */
  readonly listed: readonly number[];
  /** Every bar's start, end and cycle notches, which a moved time snaps to. */
  readonly edges: readonly number[];
  readonly expanded: ReadonlySet<number>;
  readonly expand: (index: number) => void;
}

/** The lanes' rows for `system`, with a folded or unfolded child system under each emitter. */
export function useLaneRows(system: SystemModel | null, filter: string): LaneRows {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const expand = useCallback((index: number) => setExpanded((held) => toggledIn(held, index)), []);

  const rows = useMemo<Row[]>(() => {
    if (system === null) return [];

    return matchingLanes(laneOrder(system), filter).flatMap((emitter) => {
      const nested = childLanes(emitter);
      const own: Row = { kind: "emitter", emitter, nested: nested.length > 0 };
      if (!expanded.has(emitter.index)) return [own];

      return [own, ...nested.map((lane): Row => ({ kind: "child", lane, parent: emitter }))];
    });
  }, [system, filter, expanded]);

  const every = useMemo(
    () => (system === null ? [] : laneOrder(system).map((emitter) => emitter.index)),
    [system],
  );

  const listed = useMemo(
    () => rows.flatMap((row) => (row.kind === "emitter" ? [row.emitter.index] : [])),
    [rows],
  );

  const edges = useMemo(
    () =>
      system === null
        ? []
        : system.emitters.flatMap((emitter) => {
            const bar = laneBar(emitter);
            const cycles = periodCycles(bar, EVERY_CYCLE).map((cycle) => cycle.from);
            return bar.end === null ? [bar.start, ...cycles] : [bar.start, bar.end, ...cycles];
          }),
    [system],
  );

  return { rows, every, listed, edges, expanded, expand };
}
