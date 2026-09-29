import type { LoopRange } from "../../../../state";
import { minorTicks, ticks, type TimeWindow } from "./laneModel";
import type { TimelineMarker } from "./markers";

/** One frame at 60 Hz, which a snapped time rounds to between targets. */
export const FRAME = 1 / 60;

/** What a time rounds to between targets under Ctrl. */
export const FINE_STEP = 0.001;

/** The times on the timeline that a dragged or scrubbed time snaps to. */
export interface SnapSources {
  /** Seconds one run lasts, whose end is a target. */
  readonly span: number;
  readonly loop: LoopRange | null;
  readonly markers: readonly TimelineMarker[];
  /** Every emitter's bar edges, cycle notches and bursts. */
  readonly edges: readonly number[];
  /** Null where the time snapping is the playhead's own. */
  readonly playhead: number | null;
  /** The ruler's ticks over the view, per `rulerTicks`. */
  readonly ticks: readonly number[];
}

/**
 * The ruler's ticks over `view` that a time snaps to: the labelled ones, whole seconds among
 * them, and the minor ones between unless `minor` is false. A scrub leaves the minor ones out,
 * which would quantize it to their spacing.
 */
export function rulerTicks(view: TimeWindow, width: number, minor: boolean): number[] {
  return [...ticks(view, width), ...(minor ? minorTicks(view, width) : [])];
}

/**
 * Every target in `sources`, the ruler's ticks first. `snapTime` keeps the later of two targets
 * at one distance, so a marker, an edge or the playhead wins over a tick it stands on.
 */
export function snapTargets(sources: SnapSources): number[] {
  const { span, loop, markers, edges, playhead, ticks } = sources;
  return [
    ...ticks,
    0,
    span,
    ...edges,
    ...(loop === null ? [] : [loop.from, loop.to]),
    ...markers.map((marker) => marker.time),
    ...(playhead === null ? [] : [playhead]),
  ];
}
