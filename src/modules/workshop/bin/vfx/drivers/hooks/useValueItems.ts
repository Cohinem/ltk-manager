import { useQuery } from "@tanstack/react-query";
import { use } from "react";

import type { VfxSystem } from "@/lib/tauri";

import { vfxQueries } from "../../hooks/useVfxSystem";
import { VfxRunContext } from "../../playback/state/run";
import type { ValueItem } from "../utils/graphItems";
import { systemGraph, valueItemsByPath } from "../utils/systemGraph";

const NONE: ReadonlyMap<string, ValueItem> = new Map();

/** Returns the run's system graph's value items, by the hash path of their rows. */
function selectValueItems(system: VfxSystem): ReadonlyMap<string, ValueItem> {
  return valueItemsByPath(systemGraph(system.root));
}

/**
 * Returns the keyed and randomised values of the run's system, as the graph reads them, by the
 * hash path of their rows. Returns none while the system loads, and outside a run.
 */
export function useValueItems(): ReadonlyMap<string, ValueItem> {
  const run = use(VfxRunContext);
  const { data } = useQuery({
    ...vfxQueries.system(run?.document ?? 0, run?.entry ?? ""),
    select: selectValueItems,
    enabled: run !== null,
  });
  return data ?? NONE;
}
