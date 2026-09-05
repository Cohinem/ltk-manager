import { useNavigate } from "@tanstack/react-router";

import { m } from "@/i18n";
import type { InstalledMod, ModHealthVerdict } from "@/lib/tauri";
import {
  alarmOf,
  type SweepAlarm,
  useHealthCheckReadiness,
  useHealthVerdicts,
  useInstalledMods,
  useModHealthVerdicts,
  useSweepModHealth,
} from "@/modules/library";
import { useSyncHashtables } from "@/modules/settings";
import { useModHealthDrawerStore } from "@/stores";

/**
 * The rung the library's health is drawn at, red through green.
 *
 * The three coloured findings are the rungs "How loud a finding is drawn" in
 * docs/ux/MOD_HEALTH.md defines. The grey ones are what that table has no word
 * for: a check that cannot run yet, one that is running, and one that has not
 * described this library.
 */
export type LibraryHealthState =
  | "unsynced"
  | "syncing"
  | "broken"
  | "repairable"
  | "stale"
  | "flagged"
  | "clean";

/** What the library's health amounts to, and the one thing to do about it. */
export interface LibraryHealth {
  state: LibraryHealthState;
  /** What the state amounts to, which is a count wherever there is one. */
  reading: string;
  /** Runs the errand, or `null` while the app is already running it. */
  press: (() => void) | null;
  /** The errand is under way, so the press is spent until it settles. */
  pending: boolean;
}

export interface LibraryHealthInputs {
  /** The game build League is on, or `null` while nothing reads it. */
  installedGameBuild: string | null;
}

/**
 * The library's health as one marker, per "The health marker" in docs/ux/HOME.md.
 *
 * The first state that holds wins, and a mod the patch would not carry counts
 * for none of them. `null` until the library has loaded, so the marker does not
 * open on a green it has nothing behind yet.
 */
export function useLibraryHealth({
  installedGameBuild,
}: LibraryHealthInputs): LibraryHealth | null {
  const readiness = useHealthCheckReadiness();
  const troubled = useHealthVerdicts({ health: "broken", enabled: true });
  const { data: verdicts } = useModHealthVerdicts();
  const { data: mods } = useInstalledMods();
  const syncHashtables = useSyncHashtables();
  const sweep = useSweepModHealth();
  const navigate = useNavigate();
  const openDrawer = useModHealthDrawerStore((s) => s.openDrawer);
  const requestRepair = useModHealthDrawerStore((s) => s.requestRepair);

  const show = () => {
    void navigate({ to: "/mods" });
    openDrawer();
  };

  if (readiness === "syncing" || syncHashtables.isPending) {
    return {
      state: "syncing",
      reading: m.home_library_health_syncing_label(),
      press: null,
      pending: true,
    };
  }

  if (readiness === "unsynced") {
    return {
      state: "unsynced",
      reading: m.home_library_health_unsynced_label(),
      press: () => syncHashtables.mutate(false),
      pending: false,
    };
  }

  if (sweep.isPending) {
    return {
      state: "syncing",
      reading: m.home_library_health_checking_label(),
      press: null,
      pending: true,
    };
  }

  if (!mods || !verdicts) return null;

  const broken = tally(troubled, "broken");
  if (broken > 0) {
    return {
      state: "broken",
      reading: m.common_health_broken_label({ count: broken }),
      press: show,
      pending: false,
    };
  }

  const repairable = tally(troubled, "repairable");
  if (repairable > 0) {
    return {
      state: "repairable",
      reading: m.common_health_repairs_label({ count: repairable }),
      press: () => {
        void navigate({ to: "/mods" });
        requestRepair();
      },
      pending: false,
    };
  }

  if (stale(mods, verdicts, installedGameBuild)) {
    return {
      state: "stale",
      reading: m.home_library_health_stale_label(),
      press: () => sweep.mutate(undefined),
      pending: false,
    };
  }

  const flagged = tally(troubled, "flagged");
  if (flagged > 0) {
    return {
      state: "flagged",
      reading: m.common_health_flagged_label({ count: flagged }),
      press: show,
      pending: false,
    };
  }

  return {
    state: "clean",
    reading: m.home_library_health_clean_label(),
    press: () => sweep.mutate(undefined),
    pending: false,
  };
}

/** How many of `verdicts` sit on one rung. */
function tally(verdicts: ModHealthVerdict[], rung: SweepAlarm): number {
  return verdicts.filter((verdict) => alarmOf(verdict) === rung).length;
}

/**
 * Whether the stored verdicts describe a library other than the one on disk.
 *
 * A library nothing has swept and a library swept before League moved are the
 * same news to a reader - what they were told does not answer for what they
 * have - so they are one state with one press.
 */
function stale(
  mods: InstalledMod[],
  verdicts: Record<string, ModHealthVerdict>,
  installedGameBuild: string | null,
): boolean {
  if (mods.length === 0) return false;
  if (!mods.some((mod) => verdicts[mod.id])) return true;

  return installedGameBuild !== null && checkedBuild(verdicts) !== installedGameBuild;
}

/** The game build the stored verdicts were taken on, or `null` before any were. */
function checkedBuild(verdicts: Record<string, ModHealthVerdict>): string | null {
  for (const verdict of Object.values(verdicts)) {
    return verdict.basis.build;
  }
  return null;
}
