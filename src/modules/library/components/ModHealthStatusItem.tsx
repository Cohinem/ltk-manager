import { type Icon, WarningCircleIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react";
import { match } from "ts-pattern";

import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";
import { useModHealthDrawerStore } from "@/stores";

import { useHealthVerdicts } from "../api";
import { alarmOver, type SweepAlarm, toneOf } from "./modHealthNotice";

/**
 * What the library's mod health amounts to, as a cell in the status bar.
 *
 * Per "The status bar item" in docs/ux/MOD_HEALTH.md. The glyph carries the cell
 * and the words qualify it, so the label stays at the bar's own size while the
 * icon runs most of its height.
 */
export function ModHealthStatusItem() {
  const broken = useHealthVerdicts({ health: "broken" });
  const repairable = useHealthVerdicts({ health: "repairable" });
  const shown = useModHealthDrawerStore((s) => s.open);
  const hosted = useModHealthDrawerStore((s) => s.hosted);
  const openDrawer = useModHealthDrawerStore((s) => s.openDrawer);
  const close = useModHealthDrawerStore((s) => s.close);

  // The bar spans the app and the drawer is the library's, so away from it this
  // cell would be a press that does nothing.
  if (broken.length === 0 || !hosted) return null;

  const alarm = alarmOver(broken);
  const tone = toneOf(alarm);
  const ItemIcon = GLYPHS[alarm];
  /* Only the repairable rung counts a subset: the other two are reached only
     when no repair is on offer, so every broken mod is one of theirs. */
  const count = alarm === "repairable" ? repairable.length : broken.length;

  function toggle() {
    if (shown) {
      close();
      return;
    }
    openDrawer();
  }

  return (
    <Tooltip content={hint(alarm, shown)}>
      <Button
        variant="duotone"
        size="sm"
        onClick={toggle}
        aria-expanded={shown}
        /* Its own height, because the bar's is whatever the activity line needs -
           a stepper mid-build would stretch this into a panel. */
        className={`mr-1.5 h-6 shrink-0 gap-1 self-center rounded-sm px-2 text-row tabular-nums ${tone.cell} ${shown ? tone.held : ""}`}
      >
        <ItemIcon className="h-4 w-4 shrink-0" weight="bold" />
        {label(alarm, count)}
      </Button>
    </Tooltip>
  );
}

/**
 * The glyph each rung is found by, so the cell is told apart by shape as well
 * as by hue. The triangle is the one the severity tally already spends on a
 * warning.
 */
const GLYPHS: Record<SweepAlarm, Icon> = {
  repairable: WrenchIcon,
  broken: WarningCircleIcon,
  flagged: WarningIcon,
};

/** What the press will do, since the cell's own words only ever say the count. */
function hint(alarm: SweepAlarm, shown: boolean): string {
  if (shown) return m.library_health_status_hide_hint();

  return match(alarm)
    .with("repairable", () => m.library_health_status_repairable_hint())
    .with("broken", () => m.library_health_status_broken_hint())
    .with("flagged", () => m.library_health_status_flagged_hint())
    .exhaustive();
}

/**
 * The cell's own words, which have room for a count and little else.
 *
 * `broken` is spent only where the game is what pays for it. A mod that loads
 * and plays is `flagged`, because calling that broken is what sent readers
 * looking for a replacement they did not need.
 */
function label(alarm: SweepAlarm, count: number): string {
  return match(alarm)
    .with("repairable", () => m.common_health_repairs_label({ count }))
    .with("broken", () => m.common_health_broken_label({ count }))
    .with("flagged", () => m.common_health_flagged_label({ count }))
    .exhaustive();
}
