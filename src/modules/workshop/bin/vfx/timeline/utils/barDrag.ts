import { type LaneBar, type TimeWindow, xOf } from "./laneModel";

/**
 * What a press on a lane's bar drags: the whole bar, its first emission alone, the end of
 * its emission, or the end of its linger.
 */
export type BarGrip = "move" | "start" | "end" | "linger";

/** How near a bar's edge a press grips it, in pixels. */
export const BAR_GRIP = 5;

/** How near a snap target a dragged time lands on it, in pixels. */
export const SNAP_REACH = 6;

/** The shortest emission an edge drags to, one frame at 60 Hz. */
const LEAST_LIFETIME = 1 / 60;

/** The emitter fields a bar's timing is written to. */
export type TimingField = "timeBeforeFirstEmission" | "lifetime" | "particleLinger";

/** Where an edge of `bar` stands, in seconds, and null for an edge the bar lacks. */
export function edgeTime(grip: BarGrip, bar: LaneBar, view: TimeWindow): number | null {
  switch (grip) {
    case "move":
    case "start":
      return bar.start;
    case "end":
      return Math.min(bar.end ?? view.to, view.to);
    default:
      return bar.end === null ? null : bar.end + bar.tail + bar.linger;
  }
}

/**
 * What a press `x` pixels into `width` pixels of `view` grips on `bar`, and null for none.
 *
 * The nearest edge within `BAR_GRIP` wins, the end over the start on a tie, so a bar too
 * short to tell its edges apart still takes both. A press on the bar between its edges moves
 * it. `lingers` is false for an emitter whose linger the engine caps to nothing.
 */
export function barGripAt(
  bar: LaneBar,
  view: TimeWindow,
  width: number,
  x: number,
  lingers: boolean,
): BarGrip | null {
  const grips: BarGrip[] = lingers ? ["linger", "end", "start"] : ["end", "start"];
  let best: BarGrip | null = null;
  let nearest = BAR_GRIP;
  for (const grip of grips) {
    const time = edgeTime(grip, bar, view);
    if (time === null) continue;

    const near = Math.abs(x - xOf(view, width, time));
    if (near < nearest || (best === null && near <= nearest)) {
      best = grip;
      nearest = near;
    }
  }
  if (best !== null) return best;

  const left = xOf(view, width, bar.start);
  const right = xOf(view, width, Math.min(bar.end ?? view.to, view.to));
  return x > left && x < right ? "move" : null;
}

/**
 * `held` with the part `grip` names moved to put its edge at `time`.
 *
 * A move carries the whole bar. The start alone trims the emission, keeping its end, and
 * never past it. `held.end` is the end the drag started from, which for an endless bar
 * dragged by its end is where the view drew it.
 */
export function draggedBar(grip: BarGrip, held: LaneBar, time: number): LaneBar {
  switch (grip) {
    case "move": {
      const start = Math.max(time, 0);
      return { ...held, start, end: held.end === null ? null : held.end + start - held.start };
    }
    case "start": {
      const most = held.end === null ? Infinity : held.end - LEAST_LIFETIME;
      return { ...held, start: Math.min(Math.max(time, 0), most) };
    }
    case "end":
      return { ...held, end: Math.max(time, held.start + LEAST_LIFETIME) };
    default: {
      const tail = (held.end ?? held.start) + held.tail;
      return { ...held, linger: Math.max(time - tail, 0) };
    }
  }
}

/** The fields a drag of `grip` leaves `bar` writing, and the seconds each takes. */
export function barFields(
  grip: BarGrip,
  bar: LaneBar,
): readonly { readonly field: TimingField; readonly value: number }[] {
  const lifetime = bar.end === null ? null : bar.end - bar.start;
  switch (grip) {
    case "move":
      return [{ field: "timeBeforeFirstEmission", value: bar.start }];
    case "start":
      return lifetime === null
        ? [{ field: "timeBeforeFirstEmission", value: bar.start }]
        : [
            { field: "timeBeforeFirstEmission", value: bar.start },
            { field: "lifetime", value: lifetime },
          ];
    case "end":
      return [{ field: "lifetime", value: lifetime ?? 0 }];
    default:
      return [{ field: "particleLinger", value: bar.linger }];
  }
}

/** The seconds a drag's readout shows: where the edge stands, or the span it sets. */
export function dragReadout(grip: BarGrip, bar: LaneBar): number {
  if (grip === "end") return (bar.end ?? bar.start) - bar.start;
  if (grip === "linger") return bar.linger;
  return bar.start;
}

/**
 * `time` pulled onto the nearest of `targets` within `SNAP_REACH` pixels, and otherwise
 * rounded to `step` seconds. The snap answers the target it took, for the guide it draws.
 */
export function snapTime(
  time: number,
  targets: readonly number[],
  view: TimeWindow,
  width: number,
  step: number,
): { readonly time: number; readonly snapped: number | null } {
  const perPixel = (view.to - view.from) / Math.max(width, 1);
  let best: number | null = null;
  let nearest = SNAP_REACH * perPixel;
  for (const target of targets) {
    const near = Math.abs(time - target);
    if (near <= nearest) {
      best = target;
      nearest = near;
    }
  }
  if (best !== null) return { time: best, snapped: best };

  return { time: Math.round(time / step) * step, snapped: null };
}
