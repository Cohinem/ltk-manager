import {
  CaretRightIcon,
  CheckCircleIcon,
  HeartbeatIcon,
  type Icon,
  SpinnerGapIcon,
  WarningCircleIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react";

import { AlertBox, type StatusTone } from "@/components";
import { m } from "@/i18n";

import { type LibraryHealth, type LibraryHealthState, useLibraryHealth } from "../api";

/** The build League is on, once a query reads it. `null` keeps the stale state unreachable. */
const INSTALLED_GAME_BUILD: string | null = null;

/* The hue is the severity's: DS-KIND-HUE. */
const TONE: Record<LibraryHealthState, StatusTone> = {
  unsynced: "neutral",
  syncing: "neutral",
  broken: "danger",
  repairable: "warning",
  stale: "warning",
  flagged: "neutral",
  clean: "success",
};

/**
 * The glyph each state is found by, so the marker is told apart by shape as
 * well as by hue. The wrench and the two alerts are the ones the status bar
 * item already spends on the same three rungs.
 */
const GLYPHS: Record<LibraryHealthState, Icon> = {
  unsynced: HeartbeatIcon,
  syncing: HeartbeatIcon,
  broken: WarningCircleIcon,
  repairable: WrenchIcon,
  stale: HeartbeatIcon,
  flagged: WarningIcon,
  clean: CheckCircleIcon,
};

/**
 * What the library's health amounts to, as one row of the library tile.
 *
 * Per "The health marker" in docs/ux/HOME.md. The title is fixed and the hue
 * carries the state, so the row is found in the same place whatever it says.
 */
export function LibraryHealthMarker() {
  const health = useLibraryHealth({ installedGameBuild: INSTALLED_GAME_BUILD });

  if (!health) return null;

  const Glyph = GLYPHS[health.state];
  const glyph = <Glyph className="size-4" weight="bold" />;

  if (!health.press) {
    return (
      <AlertBox
        data-ui="LibraryHealthMarker"
        tone={TONE[health.state]}
        icon={glyph}
        title={m.home_library_health_title()}
        actions={<Reading health={health} />}
        className="items-center select-none"
      />
    );
  }

  return (
    <AlertBox
      data-ui="LibraryHealthMarker"
      tone={TONE[health.state]}
      icon={glyph}
      title={m.home_library_health_title()}
      actions={<Reading health={health} />}
      className="items-center select-none"
      onClick={health.press}
    />
  );
}

/** The state's own words, which have room for a count and little else. */
function Reading({ health }: { health: LibraryHealth }) {
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-surface-300">
      {health.reading}
      {health.pending && <SpinnerGapIcon className="size-3.5 animate-spin" />}
      {!health.pending && health.press && <CaretRightIcon weight="bold" className="size-3.5" />}
    </span>
  );
}
