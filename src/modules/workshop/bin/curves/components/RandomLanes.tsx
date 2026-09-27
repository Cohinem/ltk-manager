import { Fragment, type ReactNode, use } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { type FieldUnit, UNIT_SUFFIX } from "../../values/utils/fieldUnits";
import type { ValueFamily } from "../../values/utils/valueRows";
import { VfxRunContext } from "../../vfx/playback/state/run";
import { type RandomEdit, useRandomEdit } from "../state/randomEdit";
import { channelName, chipOf, strokeOf } from "../utils/curveChannels";
import { roundDomain } from "../utils/curvePlot";
import {
  type ChannelDraw,
  drawGap,
  factorAt,
  isRandom,
  type RandomDraw,
  spread,
  valueDensity,
} from "../utils/randomDraw";
import { drawnOver, readout, shapeText } from "../utils/randomText";
import { LaneHandles } from "./LaneHandles";
import { Density, Hatch, RangeBars, Ticks } from "./LaneMarks";
import { KeysPopover } from "./RandomKeys";
import { RangeEnd, RangeLabel, ShapeCell } from "./RandomRange";

/** The even shares of a lane's scale its density is drawn in. */
const BINS = 64;

/** The room a lane leaves past an editable range's ends, as a share of its width, to drag into. */
const DRAG_ROOM = 0.25;

/**
 * Channel, least, lane, most, shape, pin value and keys, which every lane lines up on.
 *
 * Below the `@2xl` container width the fields leave a lane no room, so each channel takes two
 * lines: its fields on the first, and its lane across the whole width under them.
 */
const LANE_COLUMNS =
  "grid-cols-[max-content_max-content_max-content_minmax(0,1fr)_3.5rem_auto] @2xl:grid-cols-[max-content_max-content_minmax(0,1fr)_max-content_max-content_3.5rem_auto]";

/** A lane's own place: the second line across every column, then its column in the row. */
const LANE_CELL = "col-span-full row-start-2 @2xl:col-span-1 @2xl:row-start-auto";

/** Label, lane, pin value and keys, which every row of a moving base's readout lines up on. */
const COLUMNS = "grid-cols-[max-content_minmax(0,1fr)_3.5rem_auto]";

interface ReadingProps {
  draw: RandomDraw;
  unit: FieldUnit | null;
  /** The channels the toolbar's chips turned off. */
  muted: ReadonlySet<number>;
}

/**
 * A value whose base holds still, as one row per channel. "The random spread" in
 * docs/ux/BIN_EDITOR.md.
 *
 * A row reads left to right: the channel, the range's least, its lane on a scale of its own,
 * its most with the unit, and the shape. A lane marks the pinned chance and never sets it,
 * which only the header's `ChancePin` does.
 */
export function RandomLanes({ draw, unit, muted }: ReadingProps) {
  const pinned = use(VfxRunContext)?.pinned ?? null;
  const editor = useRandomEdit();

  return (
    <div
      data-ui="RandomLanes"
      className={`grid min-h-0 flex-1 auto-rows-min ${LANE_COLUMNS} items-center gap-x-2 gap-y-2.5 overflow-y-auto pt-1 @2xl:gap-y-1.5`}
    >
      {draw.channels
        .filter((channel) => !muted.has(channel.channel))
        .map((channel) => {
          const level = channel.base ?? 1;
          const random = isRandom(channel.shape);
          const ends = { channel, family: draw.family, unit, editor };
          return (
            <div
              key={channel.channel}
              data-ui="RandomLanes:row"
              className="col-span-full grid grid-cols-subgrid items-center gap-y-1"
            >
              <ChannelChip channel={channel} family={draw.family} />
              <RangeEnd {...ends} end="least" />
              {random && (
                <Lane
                  channel={channel}
                  family={draw.family}
                  level={level}
                  pinned={pinned}
                  editor={editor}
                />
              )}
              {!random && <StillLane channel={channel} family={draw.family} />}
              <RangeEnd {...ends} end="most" />
              <ShapeCell channel={channel} family={draw.family} editor={editor} />
              <PinValue>
                {random && pinned !== null && readout(level * factorAt(channel, pinned))}
              </PinValue>
              <span>
                {keyed(channel, editor) && <KeysPopover channel={channel} family={draw.family} />}
              </span>
            </div>
          );
        })}
    </div>
  );
}

/** A vector's or a colour's channel name, and nothing for a scalar, whose row needs none. */
function ChannelChip({ channel, family }: { channel: ChannelDraw; family: ValueFamily }) {
  if (family === "scalar") return <span />;

  return (
    <span
      /* DS-KIND-HUE, DS-TEXT */
      className={twMerge(
        "w-3 shrink-0 font-mono text-meta font-semibold select-none",
        chipOf(family, channel.channel),
      )}
    >
      {channelName(family, channel.channel)}
    </span>
  );
}

/**
 * A value whose base moves, as one row per channel read at one time.
 *
 * `levels` is each channel's base at that time, and null where the rows read the factor
 * alone, as an animated colour's do.
 */
export function DrawReadout({
  draw,
  unit,
  muted,
  levels,
}: ReadingProps & { levels: readonly (number | null)[] }) {
  const pinned = use(VfxRunContext)?.pinned ?? null;
  const editor = useRandomEdit();

  return (
    <div
      data-ui="DrawReadout"
      className={`grid shrink-0 ${COLUMNS} items-center gap-x-3 border-t border-surface-700/50 pt-1`}
    >
      {draw.channels
        .filter((channel) => !muted.has(channel.channel))
        .map((channel) => {
          const level = levels[channel.channel] ?? null;
          const random = isRandom(channel.shape);
          return (
            <Fragment key={channel.channel}>
              {editor !== null && (
                <RangeLabel channel={channel} family={draw.family} unit={unit} editor={editor} />
              )}
              {editor === null && (
                <DrawLabel
                  channel={channel}
                  family={draw.family}
                  unit={level === null ? null : unit}
                  text={drawnOver(channel, level)}
                />
              )}
              <span />
              <PinValue>{random && pinned !== null && pinText(channel, level, pinned)}</PinValue>
              <span>
                {keyed(channel, editor) && <KeysPopover channel={channel} family={draw.family} />}
              </span>
            </Fragment>
          );
        })}
    </div>
  );
}

/** A channel whose keys the fields do not already say: a split or a custom table, or any while read-only. */
function keyed(channel: ChannelDraw, editor: RandomEdit | null): boolean {
  if (!isRandom(channel.shape)) return false;
  return editor === null || channel.shape !== "uniform";
}

function pinText(channel: ChannelDraw, level: number | null, pinned: number): string {
  const factor = factorAt(channel, pinned);
  if (level === null) return m.workshop_bin_random_times_label({ range: readout(factor) });
  return readout(level * factor);
}

interface DrawLabelProps {
  channel: ChannelDraw;
  family: ValueFamily;
  unit: FieldUnit | null;
  text: string;
  /** The shape word on a line of its own, as a lane's label draws it. */
  stacked?: boolean;
}

/** A channel's name, what it draws, and the word for its shape. */
function DrawLabel({ channel, family, unit, text, stacked = false }: DrawLabelProps) {
  const random = isRandom(channel.shape);
  const named = family !== "scalar";

  return (
    <div
      data-ui="RandomLanes:label"
      className={twMerge(
        "flex min-w-0 leading-tight select-none",
        stacked ? "flex-col" : "items-baseline gap-2",
      )}
    >
      <span className="flex items-baseline gap-1.5">
        {named && (
          <span
            /* DS-KIND-HUE, DS-TEXT */
            className={twMerge(
              "w-3 shrink-0 font-mono text-meta font-semibold",
              chipOf(family, channel.channel),
            )}
          >
            {channelName(family, channel.channel)}
          </span>
        )}
        {text !== "" && (
          <span
            className={twMerge(
              "font-mono text-code tabular-nums select-text",
              random ? "text-surface-100" : "text-surface-400",
            )}
          >
            {text}
          </span>
        )}
        {text !== "" && unit !== null && (
          <span className="text-meta text-surface-400">{UNIT_SUFFIX[unit]()}</span>
        )}
      </span>
      <span
        /* DS-TEXT */
        className={twMerge(
          "text-meta",
          stacked && named && "pl-4.5",
          channel.shape === "broken" && "text-danger-text",
          channel.shape !== "broken" && random && "text-surface-400",
          channel.shape !== "broken" && !random && "text-surface-500",
        )}
      >
        {shapeText(channel)}
      </span>
    </div>
  );
}

interface LaneProps {
  channel: ChannelDraw;
  family: ValueFamily;
  level: number;
  pinned: number | null;
  editor: RandomEdit | null;
}

/** One random channel on its own scale: what it draws, and where the pinned chance lands. */
function Lane({ channel, family, level, pinned, editor }: LaneProps) {
  const ranges = channel.factors.map((range) => spread(level, range));
  const least = Math.min(...ranges.map((range) => range.least));
  const most = Math.max(...ranges.map((range) => range.most));
  const room = editor === null ? 0 : (most - least || Math.abs(most) || 1) * DRAG_ROOM;
  const { low, high, ticks } = roundDomain(least - room, most + room);
  const share = (value: number) => ((value - low) / (high - low)) * 100;
  const density = valueDensity(channel, level, { least: low, most: high }, BINS);
  const gap = drawGap(channel);
  const pin = pinned === null ? null : share(level * factorAt(channel, pinned));

  return (
    <div data-ui="RandomLanes:lane" className={twMerge("flex min-w-0 flex-col gap-0.5", LANE_CELL)}>
      <div
        role="group"
        aria-label={m.workshop_bin_random_lane_label({
          channel: channelName(family, channel.channel),
        })}
        /* DS-RADIUS, DS-VEIL */
        className="relative h-6 touch-none rounded-sm bg-surface-veil-soft"
      >
        {ticks.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className={twMerge(
              "absolute inset-y-0 w-px",
              tick === 0 ? "bg-surface-500" : "bg-surface-700/60",
            )}
            style={{ left: `${share(tick)}%` }}
          />
        ))}
        {gap !== null && (
          <Hatch left={share(gap.least)} width={share(gap.most) - share(gap.least)} />
        )}
        {channel.shape === "custom" && (
          <Density density={density} hue={strokeOf(family, channel.channel)} />
        )}
        {channel.shape !== "custom" && (
          <RangeBars ranges={ranges} share={share} hue={strokeOf(family, channel.channel)} />
        )}
        {pin !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent-400"
            style={{ left: `${pin}%` }}
          />
        )}
        {editor !== null && (
          <LaneHandles channel={channel} family={family} low={low} high={high} editor={editor} />
        )}
      </div>
      <Ticks ticks={ticks} share={share} />
    </div>
  );
}

/** A channel the roll leaves alone: a dim line, with a tick where the value sits. */
function StillLane({ channel, family }: { channel: ChannelDraw; family: ValueFamily }) {
  return (
    <div
      data-ui="RandomLanes:still"
      className={twMerge("hidden h-6 items-center @2xl:flex", LANE_CELL)}
    >
      <span className="relative h-px w-full bg-surface-700">
        {channel.shape !== "broken" && (
          <span
            /* DS-KIND-HUE */
            className={twMerge(
              "absolute top-1/2 left-1/2 h-3 w-0.5 -translate-1/2 bg-current opacity-60",
              strokeOf(family, channel.channel),
            )}
          />
        )}
      </span>
    </div>
  );
}

function PinValue({ children }: { children: ReactNode }) {
  return (
    <span className="pt-1 text-right font-mono text-code text-accent-300 tabular-nums select-text">
      {children}
    </span>
  );
}
