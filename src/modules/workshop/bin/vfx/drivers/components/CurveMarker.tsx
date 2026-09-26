import { type Ref, use, useEffect, useMemo, useRef } from "react";

import { twMerge } from "@/utils";

import { type Plot, plotLevel, plotOf } from "../../../curves/utils/curvePlot";
import { drawnAtBirth } from "../../../curves/utils/randomDraw";
import { placeTime, timeSpan } from "../../../values/utils/valueRows";
import type { EmitterModel } from "../../engine/model/model";
import { age01, emitterPhase } from "../../engine/simulation/particleRead";
import { keysAt } from "../../engine/utils/sampleCurve";
import { type VfxRun, VfxRunContext } from "../../playback/state/run";
import { CURVE_BOX } from "../utils/curveShape";
import { emitterOf } from "../utils/graphEmitter";
import type { ValueItem } from "../utils/graphItems";

/** The emitter fields other than the birth ones that the engine reads at the emitter's life. */
const EMITTER_LIFE: ReadonlySet<string> = new Set([
  "rate",
  "acceleration",
  "drag",
  "velocity",
  "bindWeight",
  "worldAcceleration",
  "EmitterPosition",
]);

/** The most live particles a per-particle curve marks, which keeps a dense emitter legible. */
const MAX_PARTICLES = 24;

/* A lone channel marks in the node's hue, and a vector's channels in the curve panel's colours. */
const CHANNEL_FILL = ["bg-channel-1", "bg-channel-2", "bg-channel-3", "bg-channel-4"] as const;
const HUE_FILL = "bg-(--node-hue)";

/**
 * The run's place on a value node's curve, which the run's clock moves every frame.
 *
 * A field the engine reads at its emitter's life gets a line there with a dot on each
 * channel, as the curve panel's playhead does. A field every particle reads at its own age
 * gets a dot per live particle riding each channel. A random value's tables get a line at
 * the pinned chance, and none while no chance is pinned. A value nested under a struct of
 * the emitter draws no marker.
 */
export function CurveMarker({ item, shape }: { item: ValueItem; shape: "keys" | "tables" }) {
  const run = use(VfxRunContext);
  const emitter = useMemo(() => emitterOf(run?.system ?? null, item.id), [run?.system, item.id]);
  const plot = useMemo(() => plotOf(item.curve.keys, CURVE_BOX), [item.curve]);
  if (run === null || emitter === undefined) return null;

  if (shape === "tables") return <ChanceLine run={run} item={item} />;
  if (plot === null) return null;
  const props = { run, emitter, item, plot };
  if (drawnAtBirth(item.label) || EMITTER_LIFE.has(item.label)) return <EmitterLine {...props} />;
  return <ParticleDots {...props} />;
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
          strong
        />
      ))}
    </>
  );
}

function ParticleDots({ run, emitter, item, plot }: MarkerProps) {
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const channels = plot.lines.length;

  useEffect(() => {
    const place = () => {
      const { pool, time } = run.driver;
      let shown = 0;
      for (let index = 0; index < pool.count && shown < MAX_PARTICLES; index += 1) {
        if (pool.emitter[index] !== emitter.index) continue;

        const t01 = age01(pool, index, time);
        const left = percent(placeTime(t01, plot));
        keysAt(item.curve.keys, t01).forEach((value, channel) => {
          moveDot(dots.current[shown * channels + channel], left, level(plot, value));
        });
        shown += 1;
      }
      for (let rest = shown * channels; rest < MAX_PARTICLES * channels; rest += 1) {
        dots.current[rest]?.style.setProperty("display", "none");
      }
    };
    place();
    return run.subscribe(place);
  }, [run, emitter, item.curve.keys, plot, channels]);

  return Array.from({ length: MAX_PARTICLES * channels }, (_, at) => (
    <Dot
      key={at}
      ref={(element) => {
        dots.current[at] = element;
      }}
      fill={channels === 1 ? HUE_FILL : CHANNEL_FILL[at % channels]}
      strong={false}
    />
  ));
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
function Dot({ ref, fill, strong }: { ref: Ref<HTMLSpanElement>; fill: string; strong: boolean }) {
  return (
    <span
      ref={ref}
      aria-hidden
      className={twMerge(
        "pointer-events-none absolute hidden -translate-1/2 rounded-full ring-1 ring-surface-900",
        strong ? "size-2" : "size-1.5 opacity-80",
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
