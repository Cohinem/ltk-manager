import { useMemo } from "react";

import { type ModHealthVerdict } from "@/lib/tauri";

import { useInstalledMods } from "./queries";
import { useModHealthVerdicts } from "./useModHealthVerdicts";

export interface BrokenMods {
  /** Every unhealthy verdict, in library order. */
  all: ModHealthVerdict[];
  /** Verdicts a repair would fix, in library order. */
  repairable: ModHealthVerdict[];
  /** Verdicts with findings and no fix for any, in library order. */
  unrepairable: ModHealthVerdict[];
}

/**
 * The library's unhealthy mods, split by whether a repair can reach them.
 *
 * Walks the installed mods and looks each verdict up, rather than walking the
 * verdicts: a verdict outlives the mod it describes until the next sweep prunes
 * it, and it carries no name for a row to draw either way.
 */
export function useBrokenMods(): BrokenMods {
  const { data: verdicts } = useModHealthVerdicts();
  const { data: mods } = useInstalledMods();

  return useMemo(() => {
    /* Healthy is a verdict like any other, so the unhealthy ones are what this
       hook is about and every list it returns is drawn from them. */
    const broken = (mods ?? [])
      .map((mod) => verdicts?.[mod.id])
      .filter(
        (verdict): verdict is ModHealthVerdict =>
          verdict !== undefined && verdict.health !== "healthy",
      );

    return {
      all: broken,
      repairable: broken.filter((verdict) => verdict.health === "repairable"),
      unrepairable: broken.filter((verdict) => verdict.health === "unrepairable"),
    };
  }, [mods, verdicts]);
}
