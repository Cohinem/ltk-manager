import { use, useMemo } from "react";

import { emitterAtPath, usePlayheadRead } from "../../../curves/hooks/curvePlayhead";
import type { Driver } from "../../engine/simulation/driver";
import { type VfxRun, VfxRunContext } from "../../playback/state/run";
import type { ValueItem } from "../utils/graphItems";
import { GraphActionsContext } from "./graphActions";

export interface ValuePlayhead {
  /** The run, and null where the value sits under no emitter of the run's system. */
  readonly run: VfxRun | null;
  /** Where the playhead stands in the value's curve, per `usePlayheadRead`. */
  readonly read: (driver: Driver) => number | null;
}

/** The run's playhead in a value node's curve, which the marker and the live readout follow. */
export function useValuePlayhead(item: ValueItem): ValuePlayhead {
  const run = use(VfxRunContext);
  const entry = use(GraphActionsContext)?.entry ?? "";
  const system = run?.system ?? null;
  const emitter = useMemo(
    () => emitterAtPath(system, entry, item.wire),
    [system, entry, item.wire],
  );
  const read = usePlayheadRead(emitter, item.label);

  return { run: emitter === undefined ? null : run, read };
}
