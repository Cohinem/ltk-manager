import { type Icon, InfoIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";

import { Button } from "@/components";

import { type HomeStatusTone, useHomeStatus } from "../api";

/* The hue is the severity's, and the words stay the verdict's: DS-KIND-HUE. */
const TONE_CLASS: Record<HomeStatusTone, string> = {
  muted: "text-surface-300",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

const TONE_GLYPH: Record<HomeStatusTone, Icon> = {
  muted: InfoIcon,
  warning: WarningIcon,
  danger: WarningCircleIcon,
};

/** The build League is on, once a query reads it. `null` keeps the build's row off the page. */
const INSTALLED_GAME_BUILD: string | null = null;

/** What stands between the reader and Play, drawn over both columns while it stands. */
export function HomeHeader() {
  const status = useHomeStatus({ installedGameBuild: INSTALLED_GAME_BUILD });

  if (!status) return null;

  const Glyph = TONE_GLYPH[status.tone];

  return (
    <header data-ui="HomeHeader" className="flex items-center gap-3 select-none">
      <p
        className={twMerge(
          "flex min-w-0 items-center gap-2 text-lg font-semibold",
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
    </header>
  );
}
