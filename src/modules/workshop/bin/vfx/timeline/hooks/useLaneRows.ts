import { useCallback, useMemo, useState } from "react";

import type { SystemModel } from "../../engine/model/model";
import { toggled } from "../../playback/state/run";
import type { Row } from "../components/LaneRow";
import { childLanes, laneBar, laneOrder, matchingLanes } from "../utils/laneModel";

/** What the lanes list under `filter`, and the emitters whose child lanes are unfolded. */
export interface LaneRows {
  readonly rows: readonly Row[];
  /** Every emitter's pool index in draw order, filtered or not. */
  readonly every: readonly number[];
  /** Every emitter's pool index the filter lists, in the order it lists them. */
  readonly listed: readonly number[];
  /** Every bar's start and end, which a dragged edge snaps to. */
  readonly edges: readonly number[];
  readonly expanded: ReadonlySet<number>;
  readonly expand: (index: number) => void;
}

/** The lanes' rows for `system`, with a folded or unfolded child system under each emitter. */
export function useLaneRows(system: SystemModel | null, filter: string): LaneRows {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const expand = useCallback((index: number) => setExpanded((held) => toggled(held, index)), []);

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
            return bar.end === null ? [bar.start] : [bar.start, bar.end];
          }),
    [system],
  );

  return { rows, every, listed, edges, expanded, expand };
}
