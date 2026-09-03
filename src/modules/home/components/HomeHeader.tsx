import {
  CheckCircleIcon,
  type Icon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";

import { Button } from "@/components";
import { m } from "@/i18n";
import { PlayButton, useActiveProfile, useInstalledMods } from "@/modules/library";

import { type HomeStatusTone, useHomeStatus } from "../api";

/* The hue is the severity's, and the words stay the verdict's: DS-KIND-HUE. */
const TONE_CLASS: Record<HomeStatusTone, string> = {
  ready: "text-success-text",
  muted: "text-surface-300",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

const TONE_GLYPH: Record<HomeStatusTone, Icon> = {
  ready: CheckCircleIcon,
  muted: InfoIcon,
  warning: WarningIcon,
  danger: WarningCircleIcon,
};

/** The build League is on, once a query reads it. `null` keeps the build's row and fact off the page. */
const INSTALLED_GAME_BUILD: string | null = null;

interface HomeHeaderProps {
  /** Set while a library action that must not overlap a patch is in progress. */
  installing: boolean;
}

/** The status line, the facts under it, and the library's Play button. */
export function HomeHeader({ installing }: HomeHeaderProps) {
  const status = useHomeStatus({ installedGameBuild: INSTALLED_GAME_BUILD });
  const { data: profile } = useActiveProfile();
  const { data: mods = [] } = useInstalledMods();
  const Glyph = TONE_GLYPH[status.tone];
  const enabled = mods.filter((mod) => mod.enabled).length;

  return (
    <header data-ui="HomeHeader" className="flex items-start justify-between gap-6 select-none">
      <div className="flex min-w-0 flex-col gap-1">
        <div data-ui="HomeHeader:status" className="flex items-center gap-3">
          <p
            className={twMerge(
              "flex items-center gap-2 text-lg font-semibold",
              TONE_CLASS[status.tone],
            )}
          >
            <Glyph weight="duotone" className="h-5 w-5 shrink-0" />
            {status.line}
          </p>
          {status.action && (
            <Button
              variant="outline"
              size="xs"
              loading={status.action.pending}
              onClick={status.action.run}
            >
              {status.action.label}
            </Button>
          )}
        </div>
        <p data-ui="HomeHeader:facts" className="flex items-center gap-2 text-xs text-surface-400">
          {profile && <span className="select-text">{profile.name}</span>}
          {profile && <span aria-hidden>·</span>}
          <span>{m.home_library_enabled_count_label({ enabled, total: mods.length })}</span>
          {INSTALLED_GAME_BUILD && <span aria-hidden>·</span>}
          {INSTALLED_GAME_BUILD && <span className="select-text">{INSTALLED_GAME_BUILD}</span>}
        </p>
      </div>
      <PlayButton disabled={installing} />
    </header>
  );
}
