import { Fragment, type KeyboardEvent, type PointerEvent, type ReactNode, use } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { type FieldUnit, UNIT_SUFFIX } from "../../values/utils/fieldUnits";
import type { ValueFamily } from "../../values/utils/valueRows";
import { VfxRunContext } from "../../vfx/playback/state/run";
import { type RandomEdit, useRandomEdit } from "../state/randomEdit";
import { channelName, CHIP, STROKE } from "../utils/curveChannels";
import { roundDomain } from "../utils/curvePlot";
import {
  chanceNear,
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
import { Density, Hatch, Ticks } from "./LaneMarks";
import { KeysPopover } from "./RandomKeys";
import { RangeLabel } from "./RandomRange";

/** The even shares of a lane's scale its density is drawn in. */
const BINS = 64;

/** The room a lane leaves past an editable range's ends, as a share of its width, to drag into. */
const DRAG_ROOM = 0.25;

/** The chance one arrow key moves the pin by. */
const PIN_STEP = 0.01;

/** Where a pin moved by key starts while nothing is pinned, the middle of the chance. */
const MIDDLE = 0.5;

/** Label, lane, pin value and keys, which every row of both readings lines up on. */
const COLUMNS = "grid-cols-[max-content_minmax(0,1fr)_3.5rem_auto]";

interface ReadingProps {
  draw: RandomDraw;
  unit: FieldUnit | null;
  /** The channels the toolbar's chips turned off. */
  muted: ReadonlySet<number>;
}

/**
 * A value whose base holds still, as one lane per channel. "The random spread" in
 * docs/ux/BIN_EDITOR.md.
 *
 * A lane carries its own scale, and a click or a drag on one pins the chance there.
 */
export function RandomLanes({ draw, unit, muted }: ReadingProps) {
  const run = use(VfxRunContext);
  const pinned = run?.pinned ?? null;
  const editor = useRandomEdit();

  return (
    <div
      data-ui="RandomLanes"
      className={`grid min-h-0 flex-1 auto-rows-min ${COLUMNS} items-start gap-x-3 gap-y-1.5 overflow-y-auto pt-1`}
    >
      {draw.channels
        .filter((channel) => !muted.has(channel.channel))
        .map((channel) => {
          const level = channel.base ?? 1;
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
                  unit={unit}
                  text={drawnOver(channel, level)}
                  stacked
                />
              )}
              {random && (
                <Lane
                  channel={channel}
                  family={draw.family}
                  level={level}
                  pinned={pinned}
                  setPinned={run?.setPinned ?? null}
                  editor={editor}
                />
              )}
              {!random && <StillLane channel={channel} />}
              <PinValue>
                {random && pinned !== null && readout(level * factorAt(channel, pinned))}
              </PinValue>
              <span>
                {keyed(channel, editor) && <KeysPopover channel={channel} family={draw.family} />}
              </span>
            </Fragment>
          );
        })}
    </div>
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
              CHIP[channel.channel] ?? CHIP[0],
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
  /** Null outside a run, where there is no birth to pin. */
  setPinned: ((chance: number | null) => void) | null;
  editor: RandomEdit | null;
}

/** One random channel on its own scale: how often each value is drawn, and where the pin lands. */
function Lane({ channel, family, level, pinned, setPinned, editor }: LaneProps) {
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
    <div data-ui="RandomLanes:lane" className="flex min-w-0 flex-col gap-0.5">
      <div
        aria-label={m.workshop_bin_random_lane_label({
          channel: channelName(family, channel.channel),
        })}
        {...pinGesture(pinned, setPinned, (at) => chanceNear(channel, low + at * (high - low)))}
        /* DS-RADIUS, DS-VEIL */
        className={twMerge(
          "relative h-6 touch-none rounded-sm bg-surface-veil-soft outline-none focus-visible:ring-1 focus-visible:ring-accent-500",
          setPinned !== null && "cursor-ew-resize",
        )}
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
        <Density density={density} hue={STROKE[channel.channel] ?? STROKE[0]} />
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

/**
 * The props that make an element a slider over the pinned chance.
 *
 * `chanceAt` turns a share of the element's width into a chance, which a lane solves off
 * its values and a ramp reads straight. Arrow keys move the pin by `PIN_STEP`.
 */
export function pinGesture(
  pinned: number | null,
  setPinned: ((chance: number | null) => void) | null,
  chanceAt: (share: number) => number,
) {
  const pinAt = (event: PointerEvent<HTMLElement>) => {
    if (setPinned === null) return;
    const box = event.currentTarget.getBoundingClientRect();
    setPinned(chanceAt(Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1)));
  };
  return {
    role: "slider",
    "aria-valuemin": 0,
    "aria-valuemax": 1,
    "aria-valuenow": pinned ?? MIDDLE,
    "aria-disabled": setPinned === null,
    tabIndex: setPinned === null ? -1 : 0,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (setPinned === null) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pinAt(event);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) pinAt(event);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const by = NUDGE[event.key];
      if (setPinned === null || by === undefined) return;
      event.preventDefault();
      setPinned(Math.min(Math.max((pinned ?? MIDDLE) + by * PIN_STEP, 0), 1));
    },
  } as const;
}

const NUDGE: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
};

/** A channel the roll leaves alone: a dim line, with a tick where the value sits. */
function StillLane({ channel }: { channel: ChannelDraw }) {
  return (
    <div data-ui="RandomLanes:still" className="flex h-6 items-center">
      <span className="relative h-px w-full bg-surface-700">
        {channel.shape !== "broken" && (
          <span
            /* DS-KIND-HUE */
            className={twMerge(
              "absolute top-1/2 left-1/2 h-3 w-0.5 -translate-1/2 bg-current opacity-60",
              STROKE[channel.channel] ?? STROKE[0],
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
