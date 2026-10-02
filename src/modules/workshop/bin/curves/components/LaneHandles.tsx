import { type KeyboardEvent, type PointerEvent, useState } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { ValueFamily } from "../../values/utils/valueRows";
import type { RandomEdit } from "../state/randomEdit";
import { channelName, strokeOf } from "../utils/curveChannels";
import { type ChannelDraw, drawSpan } from "../utils/randomDraw";
import { fieldScale, splitReach, tableKeys, withReach, withSpan } from "../utils/randomEdits";
import { readout } from "../utils/randomText";

/** The share of a lane's scale one arrow key moves an end by, and Shift ten of them. */
const KEY_STEP = 0.01;

/** Significant digits a dragged end lands on, so a drag writes round numbers. */
const DRAG_DIGITS = 3;

interface LaneHandlesProps {
  channel: ChannelDraw;
  family: ValueFamily;
  /** The lane's scale, which a drag reads its pointer against. */
  low: number;
  high: number;
  editor: RandomEdit;
}

/**
 * The ends of a random channel's lane, each dragged or stepped to write its table. A range
 * has a least and a most. A split has four, where an outer end moves both outer ends and an
 * inner end both inner ones. The number follows the handle while it is held.
 */
export function LaneHandles({ channel, family, low, high, editor }: LaneHandlesProps) {
  const [held, setHeld] = useState<{ at: number; value: number } | null>(null);
  const ends = laneEnds(channel);
  const share = (value: number) => ((value - low) / (high - low)) * 100;
  const name = channelName(family, channel.channel);

  const write = (at: number, value: number) => {
    const edited = endEdit(channel, ends, at, value);
    if (edited !== null) editor.write(channel, edited);
  };
  const valueAt = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return null;

    const at = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    return Number((low + at * (high - low)).toPrecision(DRAG_DIGITS));
  };
  const step = (at: number, end: number) => (event: KeyboardEvent<HTMLElement>) => {
    const by = NUDGE[event.key];
    if (by === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    write(at, end + by * (high - low) * KEY_STEP * (event.shiftKey ? 10 : 1));
  };

  return ends.map((end, at) => {
    const value = held?.at === at ? held.value : end;
    return (
      <span
        key={at}
        role="slider"
        tabIndex={0}
        aria-label={m.workshop_bin_random_end_label({ channel: name })}
        aria-valuemin={low}
        aria-valuemax={high}
        aria-valuenow={value}
        aria-valuetext={readout(value)}
        /* DS-KIND-HUE */
        className={twMerge(
          "group/end absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none outline-none",
          strokeOf(family, channel.channel),
        )}
        style={{ left: `${share(value)}%` }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          setHeld({ at, value: end });
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const next = valueAt(event);
          if (next !== null) setHeld({ at, value: next });
        }}
        onPointerUp={() => {
          if (held !== null && held.value !== end) write(at, held.value);
          setHeld(null);
        }}
        onKeyDown={step(at, end)}
      >
        <span className="absolute inset-y-0.5 left-1/2 w-1 -translate-x-1/2 rounded-full bg-current opacity-70 transition-opacity group-hover/end:opacity-100 group-focus-visible/end:opacity-100" />
        {held?.at === at && (
          <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 rounded-sm bg-surface-800 px-1 font-mono text-meta text-surface-100 tabular-nums">
            {readout(value)}
          </span>
        )}
      </span>
    );
  });
}

const NUDGE: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
};

/** Where a channel's ends sit on its lane: a range's two, and a split's four. */
export function laneEnds(channel: ChannelDraw): number[] {
  if (channel.shape === "split") {
    return (channel.results ?? channel.factors).flatMap((range) => [range.least, range.most]);
  }
  const span = drawSpan(channel);
  return span === null ? [] : [span.least, span.most];
}

/** The keys that move end `at` of `ends` to `value`, and null for a channel with no table. */
function endEdit(channel: ChannelDraw, ends: readonly number[], at: number, value: number) {
  if (channel.table === null) return null;

  const keys = tableKeys(channel.table);
  const scale = fieldScale(channel);
  if (channel.shape !== "split") {
    const other = ends[1 - at] ?? value;
    return withSpan(keys, scale, { least: Math.min(value, other), most: Math.max(value, other) });
  }

  const reach = splitReach(channel);
  if (reach === null) return null;
  const outer = Math.abs(ends[at] ?? 0) >= (reach.least + reach.most) / 2;
  const size = Math.abs(value);
  const next = outer ? { least: reach.least, most: size } : { least: size, most: reach.most };
  return withReach(keys, scale, {
    least: Math.min(next.least, next.most),
    most: Math.max(next.least, next.most),
  });
}
