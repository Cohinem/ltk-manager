import { useMemo } from "react";
import { match } from "ts-pattern";

import { type ModHealthVerdict } from "@/lib/tauri";

import { useInstalledMods } from "../queries";
import { useModHealthVerdicts } from "./useModHealthVerdicts";

/**
 * The class of verdict a surface asks for.
 *
 * `broken` is every health that is not healthy. `informational` is the healthy
 * verdicts that still found something, which no surface draws unasked - see
 * "The verdict" in docs/ux/MOD_HEALTH.md.
 */
export type HealthClass = "broken" | "repairable" | "unrepairable" | "informational";

/** Which of the library's verdicts a surface is asking for. */
export interface HealthFilter {
  health: HealthClass;
  /** Keep only the mods a patch would carry, or with `false` only the rest. */
  enabled?: boolean;
}

/**
 * The library's verdicts of one class, in library order.
 *
 * Walks the installed mods and looks each verdict up, rather than walking the
 * verdicts: a verdict outlives the mod it describes until the next sweep prunes
 * it, and it carries no name for a row to draw either way.
 *
 * The filter is destructured into the memo's own dependencies, so a call site
 * writes the object inline without recomputing on every render.
 */
export function useHealthVerdicts({ health, enabled }: HealthFilter): ModHealthVerdict[] {
  const { data: verdicts } = useModHealthVerdicts();
  const { data: mods } = useInstalledMods();

  return useMemo(
    () =>
      (mods ?? [])
        .filter((mod) => enabled === undefined || mod.enabled === enabled)
        .map((mod) => verdicts?.[mod.id])
        .filter(
          (verdict): verdict is ModHealthVerdict => verdict !== undefined && isOf(verdict, health),
        ),
    [mods, verdicts, health, enabled],
  );
}

/** Whether a verdict belongs to the class asked for. */
function isOf(verdict: ModHealthVerdict, health: HealthClass): boolean {
  return match(health)
    .with("broken", () => verdict.health !== "healthy")
    .with("informational", () => verdict.health === "healthy" && verdict.counts.infos > 0)
    .with("repairable", "unrepairable", (rung) => verdict.health === rung)
    .exhaustive();
}
