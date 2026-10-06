import { use } from "react";

import { m } from "@/i18n";

import type { Driver } from "../../engine/simulation/driver";
import { type RateReading, rateReading } from "../../engine/simulation/rateReading";
import { VfxRunContext } from "../../playback/state/run";
import { useRunReadout } from "../../playback/state/runReadout";
import { useEmitters } from "../state/emitterChoice";
import { useEmitterModel } from "../state/emitterModel";

function readElapsed(driver: Driver): number {
  return driver.elapsed;
}

/**
 * A line at the top of the Emission group with the open emitter's rate at the playhead.
 *
 * It is not drawn for a child lane's emitter, because the playhead is the parent system's.
 * "The emission source" in docs/ux/BIN_EDITOR.md.
 */
export function RateReadout() {
  const run = use(VfxRunContext);
  const { child } = useEmitters();
  const emitter = useEmitterModel();
  const elapsed = useRunReadout(run, readElapsed);
  if (emitter === undefined || emitter.disabled || child !== null || elapsed === null) return null;

  return (
    <p
      data-ui="RateReadout"
      role="status"
      className="py-1 pr-1 pl-1.5 font-sans text-meta text-surface-400 tabular-nums select-none"
    >
      {readingText(rateReading(emitter, elapsed))}
    </p>
  );
}

/** `value` as text, with at most two decimals and no trailing zeroes. */
function plain(value: number): string {
  return String(Number(value.toFixed(2)));
}

function readingText(reading: RateReading): string {
  switch (reading.kind) {
    case "burst":
      return m.workshop_bin_emission_rate_burst_label({
        count: reading.count,
        from: plain(reading.at),
      });
    case "idle":
      return m.workshop_bin_emission_rate_idle_label();
    case "speed":
      return m.workshop_bin_emission_rate_speed_label();
    case "rate": {
      const values = { rate: plain(reading.rate), step: reading.step };
      if (reading.drawn) return m.workshop_bin_emission_rate_drawn_label(values);

      return m.workshop_bin_emission_rate_label(values);
    }
  }
}
