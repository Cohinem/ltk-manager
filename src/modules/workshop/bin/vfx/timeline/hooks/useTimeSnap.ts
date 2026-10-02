import { useCallback } from "react";

import { useTimelineSnap } from "@/stores";

import { useVfxRun } from "../../playback/state/run";
import { snapTime } from "../utils/barDrag";
import type { TimeWindow } from "../utils/laneModel";
import { FINE_STEP, FRAME, rulerTicks, snapTargets } from "../utils/snapping";
import { useTimelineMarkers } from "./useTimelineMarkers";

/** The keys a pointer event carries that change how a time snaps. */
export interface SnapKeys {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
}

/** The target the time being moved stands on itself, which it cannot snap to. */
export interface SnapSkip {
  readonly playhead?: boolean;
  readonly loop?: boolean;
  /** The id of a marker being dragged. */
  readonly marker?: string;
  /** The ruler's minor ticks, which would quantize a scrub to their spacing. */
  readonly minorTicks?: boolean;
}

/** A snapped time, and the target it landed on, null between targets. */
export interface SnappedTime {
  readonly time: number;
  readonly snapped: number | null;
}

/** Snap a dragged or scrubbed time on the timeline. */
export type TimeSnap = (time: number, keys: SnapKeys, skip?: SnapSkip) => SnappedTime;

/**
 * How a time moved on the timeline snaps, per "The timeline" in docs/ux/BIN_EDITOR.md.
 *
 * A time within reach of a target lands on it, and otherwise rounds to a frame, or to a
 * thousandth under Ctrl. Shift, or the snap switch turned off, keeps it off the targets.
 * `edges` is every emitter's bar edges and cycle notches.
 */
export function useTimeSnap(view: TimeWindow, width: number, edges: readonly number[]): TimeSnap {
  const { span, loop, driver } = useVfxRun();
  const markers = useTimelineMarkers()?.markers;
  const enabled = useTimelineSnap();

  return useCallback(
    (time, keys, skip = {}) => {
      const step = keys.ctrlKey ? FINE_STEP : FRAME;
      if (keys.shiftKey || !enabled) return snapTime(time, [], view, width, step);

      const targets = snapTargets({
        span,
        loop: skip.loop === true ? null : loop,
        markers: (markers ?? []).filter((marker) => marker.id !== skip.marker),
        edges,
        playhead: skip.playhead === true ? null : driver.phase,
        ticks: rulerTicks(view, width, skip.minorTicks !== true),
      });
      return snapTime(time, targets, view, width, step);
    },
    [enabled, span, loop, markers, edges, driver, view, width],
  );
}
