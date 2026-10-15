import { useLayoutEffect, useRef } from "react";

import { twMerge, writeText } from "@/utils";

import {
  type CurveKey,
  placeTime,
  type TimeSpan,
  type ValueFamily,
} from "../../values/utils/valueRows";
import { keysAt } from "../../vfx/engine/utils/sampleCurve";
import type { LivePlayhead } from "../hooks/curvePlayhead";
import { strokeOf } from "../utils/curveChannels";
import { type Plot, plotLevel } from "../utils/curvePlot";

/** The width of a time chip, in pixels, which is the timeline's flag width. */
const FLAG = 36;

const CHIP =
  "pointer-events-none absolute top-0 z-10 flex h-3.5 items-center justify-center rounded-sm font-mono text-meta leading-none tabular-nums";

/** A chip's `left` at `share` of the axis, held inside it so the chip never clips at an end. */
function chipLeft(share: number): string {
  return `clamp(0px, calc(${share * 100}% - ${FLAG / 2}px), calc(100% - ${FLAG}px))`;
}

/**
 * Calls `paint` with where `live` stands, at once and on every tick of the run's clock. A paint
 * writes to the DOM outside React's render, so a mark moves every frame.
 */
function useLivePaint(live: LivePlayhead | null, paint: (time: number | null) => void): void {
  useLayoutEffect(() => {
    if (live === null) return;

    const place = () => paint(live.read(live.run.driver));
    place();
    return live.run.subscribe(place);
  }, [live, paint]);
}

/** Hides `element` while `time` is null, and shows it otherwise. */
function show(element: HTMLElement | SVGElement, time: number | null): void {
  element.style.visibility = time === null ? "hidden" : "visible";
}

/** The pointer's time on a curve's time axis, as a grey chip at `share` of its width. */
export function PointerChip({ share, time }: { share: number; time: number }) {
  return (
    <span
      aria-hidden
      data-ui="TimeChip:pointer"
      className={twMerge(CHIP, "bg-surface-700 text-surface-200")}
      style={{ width: FLAG, left: chipLeft(share) }}
    >
      {time.toFixed(2)}
    </span>
  );
}

/**
 * The playhead's time on a curve's time axis, as an accent chip that follows the clock. Its
 * width and colour are the timeline's flag's, so the two read as one playhead.
 */
export function PlayheadChip({ live, span }: { live: LivePlayhead | null; span: TimeSpan }) {
  const chip = useRef<HTMLSpanElement>(null);
  useLivePaint(live, (time) => {
    const element = chip.current;
    if (element === null) return;

    show(element, time);
    if (time === null) return;

    element.style.left = chipLeft(placeTime(time, span));
    writeText(element, time.toFixed(2));
  });

  if (live === null) return null;
  return (
    <span
      ref={chip}
      aria-hidden
      data-ui="TimeChip:playhead"
      /* DS-INVARIANT */
      className={twMerge(CHIP, "bg-accent-500 text-brand-on shadow-sm")}
      style={{ width: FLAG, visibility: "hidden" }}
    />
  );
}

/** The playhead's line over a ramp, which follows the clock. */
export function PlayheadRule({ live, span }: { live: LivePlayhead | null; span: TimeSpan }) {
  const rule = useRef<HTMLSpanElement>(null);
  useLivePaint(live, (time) => {
    const element = rule.current;
    if (element === null) return;

    show(element, time);
    if (time !== null) element.style.left = `${placeTime(time, span) * 100}%`;
  });

  if (live === null) return null;
  return (
    <span
      ref={rule}
      aria-hidden
      data-ui="PlayheadRule"
      className="pointer-events-none absolute inset-y-0 w-px bg-accent-400 shadow-[0_0_6px_var(--color-accent-500)]"
      style={{ visibility: "hidden" }}
    />
  );
}

interface PlayheadMarkProps {
  live: LivePlayhead | null;
  plot: Plot;
  size: { width: number; height: number };
  family: ValueFamily;
  /** The keys the lines are drawn through. */
  keys: readonly CurveKey[];
  /** The channels the plot draws. */
  channels: readonly number[];
}

/**
 * The playhead's line down the plot with a glow, and a dot where each drawn channel crosses it,
 * which follow the clock.
 */
export function PlayheadMark({ live, plot, size, family, keys, channels }: PlayheadMarkProps) {
  const group = useRef<SVGGElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  useLivePaint(live, (time) => {
    const element = group.current;
    if (element === null) return;

    show(element, time);
    if (time === null) return;

    element.setAttribute("transform", `translate(${placeTime(time, plot) * size.width} 0)`);
    const values = keysAt(keys, time);
    channels.forEach((channel, at) => {
      const y = plotLevel(plot, size.height, values[channel] ?? 0);
      dots.current[at]?.setAttribute("cy", String(y));
    });
  });

  if (live === null) return null;
  return (
    <g ref={group} aria-hidden data-ui="PlayheadMark" style={{ visibility: "hidden" }}>
      <line
        x1={0}
        x2={0}
        y1={0}
        y2={size.height}
        className="stroke-accent-500/30"
        strokeWidth={5}
      />
      <line x1={0} x2={0} y1={0} y2={size.height} className="stroke-accent-400" strokeWidth={1} />
      {channels.map((channel, at) => (
        <circle
          key={channel}
          ref={(element) => {
            dots.current[at] = element;
          }}
          cx={0}
          cy={0}
          r={3.5}
          fill="currentColor"
          className={twMerge("stroke-surface-900", strokeOf(family, channel))}
          strokeWidth={1.5}
        />
      ))}
    </g>
  );
}
