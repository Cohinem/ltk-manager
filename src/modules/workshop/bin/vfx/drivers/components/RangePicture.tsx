import { useMemo } from "react";

import { twMerge } from "@/utils";

import type { ValueCurve } from "../../engine/model/model";
import { CURVE_BOX } from "../utils/curveShape";
import { type ChannelRange, RANGE_STEPS, rangeAt } from "../utils/valueRange";

/* A lone channel draws in the node's hue, and a vector's channels in the curve panel's colours. */
const CHANNEL_FILL = ["fill-channel-1", "fill-channel-2", "fill-channel-3", "fill-channel-4"];
export const CHANNEL_STROKE = [
  "stroke-channel-1",
  "stroke-channel-2",
  "stroke-channel-3",
  "stroke-channel-4",
] as const;
const HUE_FILL = "fill-(--node-hue)";
const HUE_STROKE = "stroke-(--node-hue)";

/** How much of a span's colour its fill takes, under its full-colour edges. */
const FILL_OPACITY = 0.3;

const { width: WIDTH, height: HEIGHT, margin: MARGIN } = CURVE_BOX;

/**
 * A random value as the span it draws, as the curve pane reads it: least to most.
 *
 * A value whose base holds still draws a bar per channel along a value axis. One whose base is
 * keyed draws a band per channel from its least to its most across the particle's life.
 */
export function RangePicture({ curve }: { curve: ValueCurve }) {
  const keyed = curve.keys.length > 1;
  const ranges = useMemo(() => rangesOf(curve, keyed), [curve, keyed]);
  const [first] = ranges;
  if (first === undefined) return null;

  const single = first.length === 1;
  const scale = scaleOf(ranges.flat());

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block h-full w-full overflow-visible"
    >
      {keyed &&
        first.map((_, channel) => (
          <Band key={channel} ranges={ranges} channel={channel} scale={scale} single={single} />
        ))}
      {!keyed &&
        first.map((range, channel) => (
          <Bar
            key={channel}
            range={range}
            row={channel}
            rows={first.length}
            scale={scale}
            single={single}
          />
        ))}
    </svg>
  );
}

/** Each step's span per channel: one step for a still base, `RANGE_STEPS` across a keyed one. */
function rangesOf(curve: ValueCurve, keyed: boolean): ChannelRange[][] {
  if (!keyed) return [rangeAt(curve, 0)];
  return Array.from({ length: RANGE_STEPS }, (_, step) => rangeAt(curve, step / (RANGE_STEPS - 1)));
}

interface Scale {
  readonly low: number;
  readonly high: number;
}

/** The value axis the spans share, opened a little past both ends and never of no width. */
function scaleOf(ranges: readonly ChannelRange[]): Scale {
  const low = Math.min(...ranges.map((range) => range.least));
  const high = Math.max(...ranges.map((range) => range.most));
  const pad = (high - low) * MARGIN || Math.max(Math.abs(high) * MARGIN, 1);
  return { low: low - pad, high: high + pad };
}

function share(scale: Scale, value: number): number {
  return (value - scale.low) / (scale.high - scale.low);
}

function tone(single: boolean, channel: number, fill: boolean): string {
  if (single) return fill ? HUE_FILL : HUE_STROKE;
  return (fill ? CHANNEL_FILL : CHANNEL_STROKE)[channel] ?? "";
}

/** One channel's span as a bar across the value axis, in its own row. */
function Bar({
  range,
  row,
  rows,
  scale,
  single,
}: {
  range: ChannelRange;
  row: number;
  rows: number;
  scale: Scale;
  single: boolean;
}) {
  const band = HEIGHT / rows;
  const middle = band * (row + 0.5);
  const left = share(scale, range.least) * WIDTH;
  const right = share(scale, range.most) * WIDTH;

  return (
    <>
      <line
        x1={0}
        x2={WIDTH}
        y1={middle}
        y2={middle}
        className="stroke-surface-600"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={left}
        y={middle - band * 0.25}
        width={Math.max(right - left, 0)}
        height={band * 0.5}
        className={twMerge(tone(single, row, true), tone(single, row, false))}
        fillOpacity={FILL_OPACITY}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

/** One channel's least and most across the life, with the span between them filled. */
function Band({
  ranges,
  channel,
  scale,
  single,
}: {
  ranges: readonly ChannelRange[][];
  channel: number;
  scale: Scale;
  single: boolean;
}) {
  const at = (step: number, value: number) =>
    `${((step / (ranges.length - 1)) * WIDTH).toFixed(2)},${((1 - share(scale, value)) * HEIGHT).toFixed(2)}`;
  const most = ranges.map((step, index) => at(index, step[channel]?.most ?? 0));
  const least = ranges.map((step, index) => at(index, step[channel]?.least ?? 0));

  return (
    <>
      <polygon
        points={[...most, ...[...least].reverse()].join(" ")}
        className={tone(single, channel, true)}
        fillOpacity={FILL_OPACITY}
      />
      {[most, least].map((line, edge) => (
        <polyline
          key={edge}
          points={line.join(" ")}
          fill="none"
          className={tone(single, channel, false)}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}
