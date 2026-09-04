import { useNavigate } from "@tanstack/react-router";

import { usePlatformSupport } from "@/hooks";
import { m } from "@/i18n";
import { useSettings } from "@/modules/settings";

/** How loud the line is drawn, per "How loud a finding is drawn" in docs/ux/MOD_HEALTH.md. */
export type HomeStatusTone = "muted" | "warning" | "danger";

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

/**
 * What stands between the reader and Play, or `null` when nothing does.
 *
 * Mod health is not among them. It is the library tile's own marker, per "The
 * health marker" in docs/ux/HOME.md, so what is left here is what no tile owns.
 */
export function useHomeStatus(): HomeStatus | null {
  const { data: platform } = usePlatformSupport();
  const { data: settings } = useSettings();
  const navigate = useNavigate();

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

  return null;
}
