import { type Ref, useEffect, useMemo, useRef } from "react";

import { twMerge } from "@/utils";

import { type Plot, plotLevel, plotOf } from "../../../curves/utils/curvePlot";
import { placeTime, type TimeSpan, timeSpan } from "../../../values/utils/valueRows";
import type { Driver } from "../../engine/simulation/driver";
import { keysAt } from "../../engine/utils/sampleCurve";
import type { VfxRun } from "../../playback/state/run";
import { CURVE_BOX } from "../utils/curveShape";
import type { ValueItem } from "../utils/graphItems";
import { useValuePlayhead } from "./valuePlayhead";
import { useFarZoom } from "./ZoomDetail";

/* A lone channel marks in the node's hue, and a vector's channels in the curve panel's colours. */
const CHANNEL_FILL = ["bg-channel-1", "bg-channel-2", "bg-channel-3", "bg-channel-4"] as const;
const HUE_FILL = "bg-(--node-hue)";

/** The shapes a value node's picture takes: a curve's lines, a random value's span, or a band. */
export type MarkedShape = "keys" | "tables" | "band";

/** Which zoom a picture shows at: the node's rows above `FAR_ZOOM`, or its far plate under it. */
export type MarkedFace = "near" | "far";

/**
 * The run's place on a value node's curve, which the run's clock moves every frame.
 *
 * A curve gets a line at the playhead `useValuePlayhead` reads, with a dot on each channel as
 * the curve panel's playhead has, and a band gets the line alone. Both hide while no
 * particle lives to place them. Only the marker of the face the zoom shows follows the run.
 */
export function CurveMarker({
  item,
  shape,
  face,
}: {
  item: ValueItem;
  shape: Exclude<MarkedShape, "tables">;
  face: MarkedFace;
}) {
  const { run, read } = useValuePlayhead(item);
  const shown = useFarZoom() === (face === "far");
  const plot = useMemo(() => plotOf(item.curve.keys, CURVE_BOX), [item.curve]);
  const span = useMemo(() => timeSpan(item.curve.keys.map((key) => key.time)), [item.curve]);
  if (run === null || plot === null || !shown) return null;

  if (shape === "band") return <PlayheadLine run={run} read={read} span={span} item={item} />;
  return <PlayheadLine run={run} read={read} span={plot} item={item} plot={plot} />;
}

interface PlayheadLineProps {
  run: VfxRun;
  read: (driver: Driver) => number | null;
  span: TimeSpan;
  item: ValueItem;
  /** The plot the dots ride, and none for a band. */
  plot?: Plot;
}

function PlayheadLine({ run, read, span, item, plot }: PlayheadLineProps) {
  const line = useRef<HTMLSpanElement>(null);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const channels = plot?.lines.length ?? 0;

  useEffect(() => {
    let placed: boolean | null = null;
    const place = () => {
      const t01 = read(run.driver);
      if (placed !== (t01 !== null)) {
        placed = t01 !== null;
        const display = placed ? "block" : "none";
        line.current?.style.setProperty("display", display);
        dots.current.forEach((dot) => dot?.style.setProperty("display", display));
      }
      if (t01 === null) return;

      const left = percent(placeTime(t01, span));
      line.current?.style.setProperty("left", left);
      if (plot === undefined) return;

      keysAt(item.curve.keys, t01).forEach((value, channel) => {
        moveDot(dots.current[channel], left, percent(plotLevel(plot, 1, value)));
      });
    };
    place();
    return run.subscribe(place);
  }, [run, read, span, item.curve.keys, plot]);

  return (
    <>
      <Line ref={line} />
      {Array.from({ length: channels }, (_, channel) => (
        <Dot
          key={channel}
          ref={(element) => {
            dots.current[channel] = element;
          }}
          fill={channels === 1 ? HUE_FILL : CHANNEL_FILL[channel]}
        />
      ))}
    </>
  );
}

/* DS-TOKEN: the accent, which the timeline's own playhead draws in. */
function Line({ ref }: { ref: Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-accent-400/80"
    />
  );
}

/* DS-POLARITY: a ring in the plate's ground keeps a dot apart from the line it rides. */
function Dot({ ref, fill }: { ref: Ref<HTMLSpanElement>; fill: string }) {
  return (
    <span
      ref={ref}
      aria-hidden
      className={twMerge(
        "pointer-events-none absolute hidden size-2 -translate-1/2 rounded-full ring-1 ring-surface-900",
        fill,
      )}
    />
  );
}

function moveDot(dot: HTMLSpanElement | null | undefined, left: string, top: string) {
  if (dot == null) return;

  dot.style.setProperty("left", left);
  dot.style.setProperty("top", top);
}

function percent(share: number): string {
  return `${(share * 100).toFixed(3)}%`;
}
