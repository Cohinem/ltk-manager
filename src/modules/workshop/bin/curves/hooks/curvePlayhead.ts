import { use, useCallback, useMemo, useRef } from "react";

import type { BinRow } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { type Followed, followedRow, following } from "../../vfx/drivers/utils/surfaceDraw";
import type { EmitterModel, SystemModel } from "../../vfx/engine/model/model";
import type { Driver } from "../../vfx/engine/simulation/driver";
import { age01, clamp01, emitterPhase } from "../../vfx/engine/simulation/particleRead";
import { type VfxRun, VfxRunContext } from "../../vfx/playback/state/run";
import { useRunReadout } from "../../vfx/playback/state/runReadout";
import { drawnAtBirth } from "../utils/randomDraw";

/** The two emitter lists of a system, by the hash a row's path leads with. */
const LISTS: ReadonlyMap<string, boolean> = new Map([
  [nameHash("complexEmitterDefinitionData").slice(2), false],
  [nameHash("simpleEmitterDefinitionData").slice(2), true],
]);

/** A row path's emitter: its list's hash and its place in the list. */
const EMITTER_PATH = /^([0-9a-f]{8})\[(\d+)\]/i;

/** The run's playhead in a curve, which a mark reads every frame. */
export interface LivePlayhead {
  readonly run: VfxRun;
  /** Where the playhead stands in the curve, per `usePlayheadRead`. */
  readonly read: (driver: Driver) => number | null;
}

/**
 * Where the run's transport stands in `row`'s curve: `playhead` at the pace of
 * `useRunReadout` for the readouts, and `live` for a mark that follows the clock every frame.
 *
 * Both are null where no playhead reaches the curve. A row of another object, such as a child
 * lane's, is not in the opened system's model and has none.
 */
export function useCurvePlayhead(row: BinRow): {
  readonly playhead: number | null;
  readonly live: LivePlayhead | null;
} {
  const run = use(VfxRunContext);
  const system = run?.system ?? null;
  const emitter = useMemo(() => emitterAtRow(system, row), [system, row]);
  const read = usePlayheadRead(emitter, row.name);
  const reached = emitter === undefined ? null : run;
  const playhead = useRunReadout(reached, read);
  const live = useMemo(() => (reached === null ? null : { run: reached, read }), [reached, read]);

  return { playhead, live };
}

/**
 * Where the playhead stands in the curve of `emitter`'s field `name`, from 0 to 1 of its time.
 *
 * A birth field samples its curve at its emitter's life, so the run's clock places it. Any
 * other field samples it at a particle's own life, so the playhead rides the particle the
 * run follows, the one the emitter's surface preview shows, and there is none while no
 * particle lives.
 */
export function usePlayheadRead(
  emitter: EmitterModel | undefined,
  name: string,
): (driver: Driver) => number | null {
  const followed = useRef<Followed>(following());
  const birth = drawnAtBirth(name);

  return useCallback(
    (driver: Driver) => {
      if (emitter === undefined) return null;
      if (birth) return clamp01(emitterPhase(emitter, driver.elapsed));

      const particle = followedRow(driver.pool, emitter.index, followed.current, driver.time);
      return particle < 0 ? null : age01(driver.pool, particle, driver.time);
    },
    [emitter, birth],
  );
}

/** The emitter of the opened system `row` sits under, from the list and place its path names. */
export function emitterAtRow(system: SystemModel | null, row: BinRow): EmitterModel | undefined {
  return emitterAtPath(system, row.entry, row.path);
}

/** The emitter of the opened system the path `path` of object `entry` sits under. */
export function emitterAtPath(
  system: SystemModel | null,
  entry: string,
  path: string,
): EmitterModel | undefined {
  if (system?.entry == null || system.entry.toLowerCase() !== entry.toLowerCase()) {
    return undefined;
  }

  const match = EMITTER_PATH.exec(path);
  const simple = match === null ? undefined : LISTS.get(match[1]!.toLowerCase());
  if (match === null || simple === undefined) return undefined;

  const listIndex = Number(match[2]);
  return system.emitters.find((each) => each.simple === simple && each.listIndex === listIndex);
}
