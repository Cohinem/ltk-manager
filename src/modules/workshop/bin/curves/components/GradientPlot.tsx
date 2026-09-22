import { type MouseEvent, use, useMemo } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { CHECKERBOARD } from "../../../preview/components/ImagePreview";
import { Swatch } from "../../values/components/ColorMark";
import {
  colorHex,
  type ColorStop,
  colorStops,
  type CurveKey,
  gradientCss,
  placeTime,
  type TimeSpan,
  timeSpan,
} from "../../values/utils/valueRows";
import { keysAt } from "../../vfx/engine/utils/sampleCurve";
import { VfxRunContext } from "../../vfx/playback/state/run";
import { axisText } from "../utils/curvePlot";
import { drawsFlat, drawsSpread, type RandomDraw, stopsAt } from "../utils/randomDraw";
import type { CurveSelectionMode } from "./CurveGraph";
import { DrawReadout, pinGesture } from "./RandomLanes";

/** The chances an animated random colour's ramp is drawn at: the two ends of the roll. */
const ENDS: readonly number[] = [0, 1];

/** The chances a still colour's roll is sampled at across its bar. */
const RAMP_STOPS = 32;

/** A colour offers no channel chips, so none is ever muted. */
const NO_MUTED: ReadonlySet<number> = new Set();
const NO_SELECTION: ReadonlySet<number> = new Set();

interface StopsProps {
  stops: readonly ColorStop[];
  span: TimeSpan;
  /** The stops the readout and the rail have selected, as indices into `stops`. */
  selected: ReadonlySet<number>;
}

/**
 * A colour curve as the ramp it runs through. "The tabs" in docs/ux/BIN_EDITOR.md.
 *
 * The band, a handle per stop on the axis under it, and the keys themselves under that.
 * Four channel lines are what a colour is made of rather than what it looks like, so a
 * colour plots none of them and the ramp is the whole reading. The rail and the table are
 * one selection, so a stop picked either way is the row read the other.
 *
 * A random colour that animates draws its ramp at both ends of the roll and at the pin. One
 * that holds still draws the roll itself, per "The random spread".
 */
export function GradientPlot({
  keys,
  draw = null,
  selected = NO_SELECTION,
  editable = false,
  onSelect,
  onAdd,
}: {
  keys: readonly CurveKey[];
  draw?: RandomDraw | null;
  selected?: ReadonlySet<number>;
  editable?: boolean;
  onSelect?: (at: number, mode: CurveSelectionMode) => void;
  onAdd?: (key: CurveKey) => void;
}) {
  const stops = useMemo(() => colorStops(keys), [keys]);
  const pinned = use(VfxRunContext)?.pinned ?? null;
  const span = timeSpan(stops.map((stop) => stop.time));
  const rolled = drawsSpread(draw);

  function addStop(event: MouseEvent<HTMLSpanElement>) {
    if (!editable || onAdd === undefined) return;

    const box = event.currentTarget.getBoundingClientRect();
    const share = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    const time = span.first + share * (span.last - span.first);
    onAdd({ time, values: keysAt(keys, time) });
  }

  if (rolled && drawsFlat(draw)) {
    const levels = draw.channels.map((each) => each.base);
    const [r = 0, g = 0, b = 0, a = 1] = levels.map((level) => level ?? 0);
    return (
      <div data-ui="GradientPlot" className="flex min-h-0 flex-1 flex-col gap-2">
        <ChanceRamp base={[r, g, b, a]} draw={draw} />
        <DrawReadout draw={draw} unit={null} muted={NO_MUTED} levels={levels} />
      </div>
    );
  }

  const chances = pinned === null ? ENDS : [...ENDS, pinned];
  return (
    <div data-ui="GradientPlot" className="flex min-h-0 flex-1 flex-col gap-1">
      {/* The rail hangs off the band, so the two are one object with no gap between them. */}
      <div className="flex shrink-0 flex-col gap-px">
        {!rolled && <Band stops={stops} editable={editable} onDoubleClick={addStop} />}
        {rolled &&
          chances.map((chance, at) => (
            <Band
              key={at}
              stops={stopsAt(stops, draw, chance)}
              label={m.workshop_bin_random_at_chance_label({ chance: chance.toFixed(2) })}
              editable={editable}
              onDoubleClick={addStop}
            />
          ))}
        <StopRail stops={stops} span={span} selected={selected} onSelect={onSelect} />
      </div>
      {stops.length > 0 && (
        <span className="flex shrink-0 justify-between text-meta text-surface-500">
          <span>{axisText(span.first)}</span>
          <span>{axisText(span.last)}</span>
        </span>
      )}
      {rolled && <DrawReadout draw={draw} unit={null} muted={NO_MUTED} levels={[]} />}
      {editable && stops.length > 0 && (
        <span className="text-meta leading-none text-surface-500 select-none">
          {m.workshop_bin_curve_edit_hint()}
        </span>
      )}
    </div>
  );
}

/**
 * Every colour a still colour's roll gives, chance 0 at the left and 1 at the right.
 *
 * The bar is the chance itself, so a click or a drag on it pins the chance at that share.
 */
function ChanceRamp({ base, draw }: { base: ColorStop["rgba"]; draw: RandomDraw }) {
  const run = use(VfxRunContext);
  const pinned = run?.pinned ?? null;
  const ramp = Array.from({ length: RAMP_STOPS + 1 }, (_, at) => {
    const chance = at / RAMP_STOPS;
    const [drawn] = stopsAt([{ time: chance, rgba: base }], draw, chance);
    return drawn ?? { time: chance, rgba: base };
  });

  return (
    <div data-ui="GradientPlot:chance" className="flex shrink-0 flex-col gap-0.5">
      <div
        aria-label={m.workshop_bin_random_ramp_label()}
        {...pinGesture(pinned, run?.setPinned ?? null, (share) => share)}
        /* DS-TOKEN, DS-VEIL, DS-RADIUS */
        className={twMerge(
          `relative h-8 touch-none overflow-hidden rounded-sm border border-surface-veil-strong outline-none focus-visible:ring-1 focus-visible:ring-accent-500 ${CHECKERBOARD} [background-size:8px_8px]`,
          run !== null && "cursor-ew-resize",
        )}
      >
        <span className="block h-full w-full" style={{ background: gradientCss(ramp) }} />
        {pinned !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent-400"
            style={{ left: `${pinned * 100}%` }}
          />
        )}
      </div>
      <span className="flex justify-between text-meta text-surface-500 select-none">
        <span>{m.workshop_bin_random_at_chance_label({ chance: axisText(0) })}</span>
        <span>{m.workshop_bin_random_at_chance_label({ chance: axisText(1) })}</span>
      </span>
    </div>
  );
}

/**
 * The stops as one bar, its alpha over a checkerboard.
 *
 * A bar of fixed height rather than one filling the pane: a ramp says the same thing at any
 * height, so the room belongs to whatever the reader opens the dock taller for. A labelled
 * bar is one ramp of several and draws thinner.
 */
function Band({
  stops,
  label,
  editable,
  onDoubleClick,
}: {
  stops: readonly ColorStop[];
  label?: string;
  editable: boolean;
  onDoubleClick: (event: MouseEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      role="img"
      aria-label={label ?? m.workshop_bin_gradient_label({ count: stops.length })}
      /* DS-TOKEN, DS-VEIL, DS-RADIUS */
      className={twMerge(
        `relative block h-6 shrink-0 overflow-hidden rounded-sm border border-surface-veil-strong ${CHECKERBOARD} [background-size:8px_8px]`,
        label !== undefined && "h-4",
        editable && "cursor-crosshair",
      )}
      onDoubleClick={onDoubleClick}
    >
      <span className="block h-full w-full" style={{ background: gradientCss(stops) }} />
      {label !== undefined && (
        <span
          aria-hidden
          /* DS-INVARIANT */
          className="absolute top-1/2 left-1 -translate-y-1/2 rounded-sm bg-scrim px-1 text-meta leading-none text-brand-on select-none"
        >
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * One marker per stop, hanging off the band at the stop's own time.
 *
 * A marker points at the band rather than floating under it, so it reads as a stop of that
 * ramp and not as a chip beside one. Its body carries the colour it lands on, which is what
 * tells two stops of one ramp apart at this size.
 */
function StopRail({
  stops,
  span,
  selected,
  onSelect,
}: StopsProps & { onSelect: ((at: number, mode: CurveSelectionMode) => void) | undefined }) {
  return (
    <span data-ui="StopRail" className="relative h-4 min-w-0">
      {stops.map((stop, at) => (
        <button
          key={at}
          type="button"
          aria-label={m.workshop_bin_gradient_stop_label({
            time: stop.time.toFixed(3),
            color: colorHex(stop.rgba),
          })}
          aria-pressed={selected.has(at)}
          className="group/stop absolute top-0 flex -translate-x-1/2 cursor-pointer flex-col items-center"
          style={{ left: `${(placeTime(stop.time, span) * 100).toFixed(2)}%` }}
          onClick={(event) => {
            if (event.shiftKey) {
              onSelect?.(at, "range");
            } else if (event.ctrlKey || event.metaKey) {
              onSelect?.(at, "toggle");
            } else {
              onSelect?.(at, "replace");
            }
          }}
        >
          <Tip selected={selected.has(at)} />
          {/* DS-HOVER */}
          <Swatch
            rgba={stop.rgba}
            className={twMerge(
              "h-3 w-3",
              selected.has(at) ? "border-accent-500" : "group-hover/stop:border-accent-hover",
            )}
          />
        </button>
      ))}
    </span>
  );
}

/** The marker's point, drawn as a border triangle so it lands on the band's own edge. */
function Tip({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={twMerge(
        "h-0 w-0 border-x-4 border-b-4 border-x-transparent",
        selected ? "border-b-accent-500" : "border-b-surface-500",
      )}
    />
  );
}
