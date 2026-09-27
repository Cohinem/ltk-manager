import { useId } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { ValueRange } from "../../values/utils/valueRows";
import { readout } from "../utils/randomText";

/** The share of its height a lane's fullest bin reaches, so the peak clears the edge. */
const PEAK = 0.85;

/** A lane's bins as one filled step, its top edge drawn brighter. */
export function Density({ density, hue }: { density: readonly number[]; hue: string }) {
  const steps = density.flatMap((each, bin) => {
    const y = (1 - each * PEAK).toFixed(3);
    return [`${bin},${y}`, `${bin + 1},${y}`];
  });
  const edge = steps.join(" ");

  return (
    <svg
      role="img"
      aria-label={m.workshop_bin_random_density_label()}
      viewBox={`0 0 ${density.length} 1`}
      preserveAspectRatio="none"
      /* DS-KIND-HUE */
      className={twMerge("absolute inset-0 h-full w-full", hue)}
    >
      <polygon points={`0,1 ${edge} ${density.length},1`} fill="currentColor" opacity={0.3} />
      <polyline
        points={edge}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A lane's ranges drawn whole, for a draw even across each of them: a bar per range in the
 * channel's hue, a light fill inside its edges, as the Graph pane's value node draws one.
 */
export function RangeBars({
  ranges,
  share,
  hue,
}: {
  ranges: readonly ValueRange[];
  /** Where a value lands across the lane, as a percentage. */
  share: (value: number) => number;
  hue: string;
}) {
  return ranges.map((range, at) => (
    <span
      key={at}
      aria-hidden
      /* DS-KIND-HUE, DS-RADIUS */
      className={twMerge("absolute inset-y-1 rounded-xs border-2 border-current", hue)}
      style={{
        left: `${share(range.least)}%`,
        width: `${Math.max(share(range.most) - share(range.least), 0)}%`,
      }}
    >
      <span className="absolute inset-0 bg-current opacity-30" />
    </span>
  ));
}

/** The values a split never draws, struck through. Its own pixels, so the stripes keep square. */
export function Hatch({ left, width }: { left: number; width: number }) {
  const pattern = useId();
  return (
    <svg
      aria-hidden
      className="absolute inset-y-0 h-full text-surface-600"
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <defs>
        <pattern
          id={pattern}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={5} stroke="currentColor" strokeWidth={1.5} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${pattern})`} />
    </svg>
  );
}

/** A lane's scale, the outer two labels kept inside its ends. */
export function Ticks({
  ticks,
  share,
}: {
  ticks: readonly number[];
  share: (value: number) => number;
}) {
  const last = ticks.length - 1;
  return (
    <div className="relative h-3 text-meta leading-none text-surface-500 tabular-nums select-none">
      {ticks.map((tick, at) => (
        <span
          key={tick}
          className={twMerge(
            "absolute top-0",
            at > 0 && at < last && "-translate-x-1/2",
            at === last && at > 0 && "-translate-x-full",
          )}
          style={{ left: `${share(tick)}%` }}
        >
          {readout(tick)}
        </span>
      ))}
    </div>
  );
}
