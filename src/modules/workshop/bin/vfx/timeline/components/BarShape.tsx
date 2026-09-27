import { CaretRightIcon } from "@phosphor-icons/react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";

import { type LaneBar, periodCycles, type TimeWindow, xOf } from "../utils/laneModel";

/** How long a pointer rests on a bar before its times show, in milliseconds. */
const BAR_DELAY = 400;

/** The narrowest cycle a period draws, in pixels, under which its cycles go undrawn. */
const LEAST_CYCLE = 4;

const BAR_BODY =
  "absolute top-1.5 bottom-1.5 rounded-sm border border-accent-500/50 bg-accent-500/25";

/** One bar: the solid emission view, the faded particle tail and the hatched linger. */
export function Bar({
  bar,
  view,
  width,
  quiet = false,
}: {
  bar: LaneBar;
  view: TimeWindow;
  width: number;
  /** A drag is on the bar, so its times stay closed. */
  quiet?: boolean;
}) {
  const left = xOf(view, width, bar.start);
  const endless = bar.end === null;
  const end = bar.end ?? view.to;
  const right = xOf(view, width, end);
  const tail = xOf(view, width, end + bar.tail);
  const linger = xOf(view, width, end + bar.tail + bar.linger);
  if (right < 0 || left > width) return null;

  return (
    <>
      {quiet && <span className={BAR_BODY} style={{ left, width: Math.max(right - left, 2) }} />}
      {!quiet && (
        <Tooltip content={<BarTimes bar={bar} />} delay={BAR_DELAY} side="top">
          <span className={BAR_BODY} style={{ left, width: Math.max(right - left, 2) }} />
        </Tooltip>
      )}
      <PeriodCycles bar={bar} view={view} width={width} />
      {bar.burst && (
        <span
          role="img"
          aria-label={m.workshop_bin_timeline_burst_label()}
          className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-accent-300"
          style={{ left }}
        />
      )}
      {endless && (
        <CaretRightIcon
          weight="bold"
          role="img"
          aria-label={m.workshop_bin_timeline_endless_label()}
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 text-accent-400"
          style={{ left: Math.min(right, width) - 12 }}
        />
      )}
      {!endless && bar.tail > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 bg-accent-500/10"
          style={{ left: right, width: Math.max(tail - right, 0) }}
        />
      )}
      {!endless && bar.linger > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-2.5 bottom-2.5 bg-[repeating-linear-gradient(135deg,var(--color-accent-500)_0_1px,transparent_1px_4px)] opacity-30"
          style={{ left: tail, width: Math.max(linger - tail, 0) }}
        />
      )}
    </>
  );
}

/** The cycles of a bar's period: a notch where each opens, and its pause darkened. */
function PeriodCycles({ bar, view, width }: { bar: LaneBar; view: TimeWindow; width: number }) {
  const period = bar.period;
  if (period === null) return null;
  if (xOf(view, width, period.length) - xOf(view, width, 0) < LEAST_CYCLE) return null;

  const end = bar.end ?? view.to;
  return (
    <>
      {periodCycles(bar, view).map((cycle) => {
        const from = xOf(view, width, cycle.from);
        const pause = xOf(view, width, cycle.active);
        const next = xOf(view, width, Math.min(cycle.from + period.length, end));
        return (
          <span key={cycle.from} aria-hidden="true">
            {cycle.from > bar.start && (
              <span
                className="pointer-events-none absolute top-1 bottom-1 w-px bg-accent-300/70"
                style={{ left: from }}
              />
            )}
            {next > pause && (
              <span
                className="pointer-events-none absolute top-1.5 bottom-1.5 bg-surface-900/70"
                style={{ left: pause, width: next - pause }}
              />
            )}
          </span>
        );
      })}
    </>
  );
}

/** When a bar emits, how long its particles live on, and where its linger ends, in seconds. */
function BarTimes({ bar }: { bar: LaneBar }) {
  const from = bar.start.toFixed(2);
  const period = bar.period === null ? null : <PeriodLine bar={bar} />;
  if (bar.end === null) {
    return (
      <span className="flex flex-col text-meta">
        <span>{m.workshop_bin_timeline_bar_endless_label({ from })}</span>
        {period}
      </span>
    );
  }
  const particles = bar.end + bar.tail;
  return (
    <span className="flex flex-col font-mono text-meta tabular-nums">
      <span>
        {bar.burst
          ? m.workshop_bin_timeline_bar_burst_label({ from })
          : m.workshop_bin_timeline_bar_emits_label({ from, to: bar.end.toFixed(2) })}
      </span>
      {period}
      {bar.tail > 0 && (
        <span className="text-surface-300">
          {m.workshop_bin_timeline_bar_particles_label({ to: particles.toFixed(2) })}
        </span>
      )}
      {bar.linger > 0 && (
        <span className="text-surface-400">
          {m.workshop_bin_timeline_bar_linger_label({
            to: (particles + bar.linger).toFixed(2),
          })}
        </span>
      )}
    </span>
  );
}

function PeriodLine({ bar }: { bar: LaneBar }) {
  if (bar.period === null) return null;

  return (
    <span className="text-surface-300">
      {m.workshop_bin_timeline_bar_period_label({
        length: bar.period.length.toFixed(2),
        active: bar.period.active.toFixed(2),
      })}
    </span>
  );
}
