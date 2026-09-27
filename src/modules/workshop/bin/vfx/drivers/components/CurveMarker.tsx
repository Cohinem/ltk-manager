import { type Ref, use, useEffect, useMemo, useRef } from "react";

import { twMerge } from "@/utils";

import { type Plot, plotLevel, plotOf } from "../../../curves/utils/curvePlot";
import { placeTime, timeSpan } from "../../../values/utils/valueRows";
import type { EmitterModel } from "../../engine/model/model";
import { emitterPhase } from "../../engine/simulation/particleRead";
import { keysAt } from "../../engine/utils/sampleCurve";
import { type VfxRun, VfxRunContext } from "../../playback/state/run";
import { CURVE_BOX } from "../utils/curveShape";
import { emitterOf } from "../utils/graphEmitter";
import type { ValueItem } from "../utils/graphItems";

/* A lone channel marks in the node's hue, and a vector's channels in the curve panel's colours. */
const CHANNEL_FILL = ["bg-channel-1", "bg-channel-2", "bg-channel-3", "bg-channel-4"] as const;
const HUE_FILL = "bg-(--node-hue)";

/**
 * The run's place on a value node's curve, which the run's clock moves every frame.
 *
 * A curve gets a line at its emitter's time with a dot on each channel, as the curve
 * panel's playhead does. A random value's tables get a line at the pinned chance, and none
 * while no chance is pinned. A value nested under a struct of the emitter draws no marker.
 */
export function CurveMarker({ item, shape }: { item: ValueItem; shape: "keys" | "tables" }) {
  const run = use(VfxRunContext);
  const emitter = useMemo(() => emitterOf(run?.system ?? null, item.id), [run?.system, item.id]);
  const plot = useMemo(() => plotOf(item.curve.keys, CURVE_BOX), [item.curve]);
  if (run === null || emitter === undefined) return null;

  if (shape === "tables") return <ChanceLine run={run} item={item} />;
  if (plot === null) return null;
  return <EmitterLine run={run} emitter={emitter} item={item} plot={plot} />;
}

interface MarkerProps {
  run: VfxRun;
  emitter: EmitterModel;
  item: ValueItem;
  plot: Plot;
}

function EmitterLine({ run, emitter, item, plot }: MarkerProps) {
  const line = useRef<HTMLSpanElement>(null);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const channels = plot.lines.length;

  useEffect(() => {
    const place = () => {
      const t01 = emitterPhase(emitter, run.driver.elapsed);
      const left = percent(placeTime(t01, plot));
      line.current?.style.setProperty("left", left);
      keysAt(item.curve.keys, t01).forEach((value, channel) => {
        moveDot(dots.current[channel], left, level(plot, value));
      });
    };
    place();
    return run.subscribe(place);
  }, [run, emitter, item.curve.keys, plot]);

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

function ChanceLine({ run, item }: { run: VfxRun; item: ValueItem }) {
  const table = item.curve.tables.find((each) => each.keys.length > 1);
  if (run.pinned === null || table === undefined) return null;

  const at = placeTime(run.pinned, timeSpan(table.keys.map((key) => key.time)));
  return <Line left={percent(at)} />;
}

/* DS-TOKEN: the accent, which the timeline's own playhead draws in. */
function Line({ ref, left }: { ref?: Ref<HTMLSpanElement>; left?: string }) {
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-accent-400/80"
      style={{ left }}
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
  dot.style.setProperty("display", "block");
}

/** Where `value` stands on `plot`'s value axis, from the top of the box. */
function level(plot: Plot, value: number): string {
  return percent(plotLevel(plot, 1, value));
}

function percent(share: number): string {
  return `${(share * 100).toFixed(3)}%`;
}
