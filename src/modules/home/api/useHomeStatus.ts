import { useNavigate } from "@tanstack/react-router";

import { usePlatformSupport } from "@/hooks";
import { m } from "@/i18n";
import type { ModHealthVerdict } from "@/lib/tauri";
import {
  alarmOf,
  useBrokenEnabledMods,
  useHealthCheckReadiness,
  useModHealthVerdicts,
  useSweepModHealth,
} from "@/modules/library";
import { useSettings, useSyncHashtables } from "@/modules/settings";
import { useModHealthDrawerStore } from "@/stores";

/** How loud the line is drawn, per "How loud a finding is drawn" in docs/ux/MOD_HEALTH.md. */
export type HomeStatusTone = "ready" | "muted" | "warning" | "danger";

export interface HomeStatusAction {
  label: string;
  run: () => void;
  /** The action is under way, so the press is spent until it settles. */
  pending?: boolean;
}

/** One sentence about the library, and at most one thing to do about it. */
export interface HomeStatus {
  tone: HomeStatusTone;
  line: string;
  action: HomeStatusAction | null;
}

export interface HomeStatusInputs {
  /** The game build League is on, or `null` while nothing reads it. */
  installedGameBuild: string | null;
}

/** Whether pressing Play is safe right now, per "The status line" in docs/ux/HOME.md. */
export function useHomeStatus({ installedGameBuild }: HomeStatusInputs): HomeStatus {
  const { data: platform } = usePlatformSupport();
  const { data: settings } = useSettings();
  const readiness = useHealthCheckReadiness();
  const brokenEnabled = useBrokenEnabledMods();
  const { data: verdicts } = useModHealthVerdicts();
  const syncHashtables = useSyncHashtables();
  const sweep = useSweepModHealth();
  const navigate = useNavigate();
  const openDrawer = useModHealthDrawerStore((s) => s.openDrawer);
  const requestRepair = useModHealthDrawerStore((s) => s.requestRepair);

  if (platform && !platform.patcherAvailable) {
    return { tone: "muted", line: m.home_status_platform_label(), action: null };
  }

  if (settings && !settings.leaguePath) {
    return {
      tone: "warning",
      line: m.home_status_league_unset_label(),
      action: {
        label: m.home_status_league_unset_action(),
        run: () => void navigate({ to: "/settings", search: { focus: "general.leaguePath" } }),
      },
    };
  }

  if (readiness === "unsynced") {
    return {
      tone: "warning",
      line: m.home_status_hashtables_unsynced_label(),
      action: {
        label: m.home_status_hashtables_action(),
        run: () => syncHashtables.mutate(false),
        pending: syncHashtables.isPending,
      },
    };
  }
  if (readiness === "syncing") {
    return { tone: "muted", line: m.home_status_hashtables_syncing_label(), action: null };
  }

  const broken = brokenEnabled.filter((verdict) => alarmOf(verdict) === "broken").length;
  if (broken > 0) {
    return {
      tone: "danger",
      line: m.home_status_broken_label({ count: broken }),
      action: {
        label: m.home_status_broken_action(),
        run: () => {
          void navigate({ to: "/mods" });
          openDrawer();
        },
      },
    };
  }

  const repairable = brokenEnabled.filter((verdict) => alarmOf(verdict) === "repairable").length;
  if (repairable > 0) {
    return {
      tone: "warning",
      line: m.home_status_repairable_label({ count: repairable }),
      action: {
        label: m.home_status_repairable_action(),
        run: () => {
          void navigate({ to: "/mods" });
          requestRepair();
        },
      },
    };
  }

  if (installedGameBuild !== null && checkedBuild(verdicts) !== installedGameBuild) {
    return {
      tone: "warning",
      line: m.home_status_build_moved_label({ build: installedGameBuild }),
      action: {
        label: m.home_status_build_moved_action(),
        run: () => sweep.mutate(undefined),
        pending: sweep.isPending,
      },
    };
  }

  return { tone: "ready", line: m.home_status_ready_label(), action: null };
}

/** The game build the stored verdicts were taken on, or `null` before any were. */
function checkedBuild(verdicts: Record<string, ModHealthVerdict> | undefined): string | null {
  for (const verdict of Object.values(verdicts ?? {})) {
    return verdict.basis.build;
  }
  return null;
}
