import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useResizeObserver } from "@/hooks";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { type FieldUnit, UNIT_SUFFIX } from "../../values/utils/fieldUnits";
import type { CurveKey, ValueFamily } from "../../values/utils/valueRows";
import { placeTime } from "../../values/utils/valueRows";
import { keysAt } from "../../vfx/engine/utils/sampleCurve";
import { VfxRunContext } from "../../vfx/playback/state/run";
import { channelName, STROKE } from "../utils/curveChannels";
import {
  axisText,
  bandOf,
  lineOf,
  type Plot,
  plotLevel,
  plotOf,
  ticksWithin,
  timeTicks,
} from "../utils/curvePlot";
import { CURVE_TIME_STEP, curveValueStep, snapCurveValue } from "../utils/curveSnapping";
import {
  type ChannelDraw,
  drawsFlat,
  drawsSpread,
  factorAt,
  isRandom,
  type RandomDraw,
  spread,
  valueDensity,
} from "../utils/randomDraw";
import { GradientPlot } from "./GradientPlot";
import { DrawReadout, RandomLanes } from "./RandomLanes";

/** How much room over and under the keys the value axis keeps, as a share of their span. */
const MARGIN = 0.12;

/** The room the value axis labels take, which the time axis keeps clear to line up under. */
const AXIS = "w-12";

/** The width of the density edge, in pixels. */
const EDGE = 40;

/** The even shares of the value axis the density edge is drawn in. */
const EDGE_BINS = 48;

/** The share of the edge's width its fullest bin reaches. */
const PEAK = 0.9;

const NO_MUTED: ReadonlySet<number> = new Set();
const NO_SELECTION: ReadonlySet<number> = new Set();

export type CurveSelectionMode = "add" | "range" | "replace" | "toggle";

interface CurveGraphProps {
  keys: readonly CurveKey[];
  family: ValueFamily;
  /** What the value's tables draw, null for a value with none or none read yet. */
  draw?: RandomDraw | null;
  unit?: FieldUnit | null;
  /** The channels the toolbar's chips turned off. */
  muted?: ReadonlySet<number>;
  /** Where the run stands in the curve's own time, null where no playhead reaches it. */
  playhead?: number | null;
  /** The keys picked by the graph, table and exact-value editor. */
  selected?: ReadonlySet<number>;
  /** Whether point dragging and double-click insertion are available. */
  editable?: boolean;
  onSelect?: (at: number, mode: CurveSelectionMode) => void;
  onSelectMany?: (at: readonly number[], mode: "add" | "replace") => void;
  onChange?: (at: number, key: CurveKey) => boolean | Promise<boolean>;
  onAdd?: (key: CurveKey) => void;
}

/**
 * A curve as the surface its family reads on, its random spread with it. "The curve panel"
 * and "The random spread" in docs/ux/BIN_EDITOR.md.
 *
 * A colour is a ramp, a random value whose base holds still is its lanes, and every other
 * value is a plot of its channels over time.
 */
export function CurveGraph({
  keys,
  family,
  draw = null,
  unit = null,
  muted = NO_MUTED,
  playhead = null,
  selected = NO_SELECTION,
  editable = false,
  onSelect,
  onSelectMany,
  onChange,
  onAdd,
}: CurveGraphProps) {
  if (family === "color") {
    return (
      <GradientPlot
        keys={keys}
        draw={draw}
        selected={selected}
        editable={editable}
        onSelect={onSelect}
        onAdd={onAdd}
      />
    );
  }
  if (drawsSpread(draw) && drawsFlat(draw)) {
    return <RandomLanes draw={draw} unit={unit} muted={muted} />;
  }
  return (
    <ChannelPlot
      keys={keys}
      draw={drawsSpread(draw) ? draw : null}
      unit={unit}
      muted={muted}
      playhead={playhead}
      family={family}
      selected={selected}
      editable={editable}
      onSelect={onSelect}
      onSelectMany={onSelectMany}
      onChange={onChange}
      onAdd={onAdd}
    />
  );
}

interface ChannelPlotProps {
  keys: readonly CurveKey[];
  /** Null for a value with nothing random to draw. */
  draw: RandomDraw | null;
  unit: FieldUnit | null;
  muted: ReadonlySet<number>;
  playhead: number | null;
  family: ValueFamily;
  selected: ReadonlySet<number>;
  editable: boolean;
  onSelect: ((at: number, mode: CurveSelectionMode) => void) | undefined;
  onSelectMany: ((at: readonly number[], mode: "add" | "replace") => void) | undefined;
  onChange: ((at: number, key: CurveKey) => boolean | Promise<boolean>) | undefined;
  onAdd: ((key: CurveKey) => void) | undefined;
}

interface KeyDrag {
  readonly at: number;
  readonly key: CurveKey;
  readonly committed: boolean;
}

interface Marquee {
  readonly pointerId: number;
  readonly start: Point;
  readonly current: Point;
  readonly additive: boolean;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The keys plotted against time, one line per channel.
 *
 * A random channel carries a band from the curve at its least factor to the curve at its
 * most, and the edge on the right draws how the births fall at one time: the cursor's,
 * else the playhead's, else the start of the curve.
 */
function ChannelPlot({
  keys,
  draw,
  unit,
  muted,
  playhead,
  family,
  selected,
  editable,
  onSelect,
  onSelectMany,
  onChange,
  onAdd,
}: ChannelPlotProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const measure = useResizeObserver<HTMLDivElement>((element) =>
    setSize({ width: element.clientWidth, height: element.clientHeight }),
  );
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<KeyDrag | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const pinned = use(VfxRunContext)?.pinned ?? null;

  const banded = useMemo(
    () =>
      new Map(
        (draw?.channels ?? [])
          .filter((each) => isRandom(each.shape))
          .map((each) => [each.channel, each]),
      ),
    [draw],
  );
  const fit = useMemo(() => bandEdges(keys, banded), [keys, banded]);
  const frame = plotOf(keys, { width: size.width, height: size.height, margin: MARGIN }, fit);
  const shownKeys = useMemo(() => {
    if (drag === null) return keys;

    return keys.map((key, at) => (at === drag.at ? drag.key : key));
  }, [drag, keys]);

  useEffect(() => {
    setDrag((held) => {
      if (held?.committed !== true) return held;

      return sameCurveKey(keys[held.at], held.key) ? null : held;
    });
  }, [keys]);
  const plot =
    drag === null || frame === null
      ? frame
      : plotOf(shownKeys, { width: size.width, height: size.height, margin: 0 }, [
          ...fit,
          frame.low,
          frame.high,
        ]);
  const drawn = plot === null ? [] : plot.lines.map((_, at) => at).filter((at) => !muted.has(at));
  const axis = plot !== null && drawn.length > 0;
  const time = hover ?? playhead ?? 0;
  const levels = keysAt(shownKeys, time);

  function follow(event: PointerEvent<HTMLDivElement>) {
    if (plot === null) return;

    if (marquee?.pointerId === event.pointerId) {
      setMarquee({ ...marquee, current: canvasPoint(event) });
    }

    if (draw === null) return;

    const box = event.currentTarget.getBoundingClientRect();
    const share = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setHover(plot.first + share * (plot.last - plot.first));
  }

  function startMarquee(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || plot === null || onSelectMany === undefined) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const start = canvasPoint(event);
    setMarquee({
      pointerId: event.pointerId,
      start,
      current: start,
      additive: event.ctrlKey || event.metaKey,
    });
  }

  function finishMarquee(event: PointerEvent<HTMLDivElement>) {
    if (marquee?.pointerId !== event.pointerId || plot === null) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const bounds = marqueeBounds(marquee);
    const hits = bounds.width < 3 && bounds.height < 3 ? [] : keysInside(plot, drawn, bounds);
    if (hits.length > 0 || !marquee.additive) {
      onSelectMany?.(hits, marquee.additive ? "add" : "replace");
    }

    setMarquee(null);
  }

  function dragPoint(event: PointerEvent<SVGCircleElement>, at: number, channel: number) {
    if (!editable || frame === null || onChange === undefined) return;

    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    const key = shownKeys[at];
    if (box === undefined || key === undefined) return;

    const x = unitShare((event.clientX - box.left) / box.width);
    const y = unitShare((event.clientY - box.top) / box.height);
    const before = keys[at - 1]?.time ?? frame.first;
    const after = keys[at + 1]?.time ?? frame.last;
    const draggedTime = frame.first + x * (frame.last - frame.first);
    const nextTime = Math.min(
      Math.max(snapCurveValue(draggedTime, CURVE_TIME_STEP), before),
      after,
    );
    const guide = curveValueStep(keys, channel, family === "color");
    const values = [...key.values];
    values[channel] = snapCurveValue(frame.high - y * (frame.high - frame.low), guide);
    setDrag({ at, key: { time: nextTime, values }, committed: false });
  }

  async function finishDrag(event: PointerEvent<SVGCircleElement>) {
    if (drag === null) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pending = { ...drag, committed: true };
    setDrag(pending);

    const saved = await onChange?.(pending.at, pending.key);
    if (saved !== false) return;

    setDrag((held) => (held === pending ? null : held));
  }

  function selectPoint(event: KeyboardEvent<SVGCircleElement>, at: number) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    onSelect?.(at, "replace");
  }

  function addPoint(event: MouseEvent<HTMLDivElement>) {
    if (!editable || onAdd === undefined || frame === null) return;

    const box = event.currentTarget.getBoundingClientRect();
    const share = unitShare((event.clientX - box.left) / box.width);
    const addedAt = snapCurveValue(
      frame.first + share * (frame.last - frame.first),
      CURVE_TIME_STEP,
    );
    const values = keysAt(keys, addedAt).map((value, channel) =>
      snapCurveValue(value, curveValueStep(keys, channel, family === "color")),
    );

    onAdd({ time: addedAt, values });
  }

  return (
    <div data-ui="ChannelPlot" className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className={`relative shrink-0 text-meta text-surface-500 select-none ${AXIS}`}>
          {axis && <ValueTicks plot={plot} height={size.height} unit={unit} />}
        </div>
        <div
          ref={measure}
          data-ui="ChannelPlot:canvas"
          className={twMerge(
            "relative min-h-0 min-w-0 flex-1",
            editable && "cursor-crosshair touch-none",
          )}
          onPointerDown={startMarquee}
          onPointerMove={follow}
          onPointerUp={finishMarquee}
          onPointerCancel={() => setMarquee(null)}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={addPoint}
        >
          {plot !== null && (
            <svg
              role="img"
              aria-label={m.workshop_bin_curve_keys_label({ count: keys.length })}
              width={size.width}
              height={size.height}
              className="relative"
            >
              <Grid plot={plot} size={size} />
              {drawn.map((channel) => (
                <g key={channel} className={STROKE[channel] ?? STROKE[0]}>
                  <Spread
                    keys={shownKeys}
                    plot={plot}
                    size={size}
                    channel={banded.get(channel)}
                    pinned={pinned}
                  />
                  <polyline
                    points={plot.lines[channel] ?? ""}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  {(plot.points[channel] ?? []).map((point, at) => (
                    <g key={at}>
                      {selected.has(at) && (
                        <circle
                          aria-hidden
                          cx={point.x}
                          cy={point.y}
                          r={5}
                          className="fill-surface-900 stroke-current"
                          strokeWidth={1.5}
                        />
                      )}
                      <circle aria-hidden cx={point.x} cy={point.y} r={2.5} fill="currentColor" />
                      {(onSelect !== undefined || editable) && (
                        <circle
                          role="button"
                          tabIndex={0}
                          aria-pressed={selected.has(at)}
                          aria-label={m.workshop_bin_curve_key_point_label({
                            channel: channelName(family, channel),
                            key: at + 1,
                            time: (shownKeys[at]?.time ?? 0).toFixed(3),
                          })}
                          cx={point.x}
                          cy={point.y}
                          r={8}
                          fill="transparent"
                          className={twMerge(
                            "outline-none focus-visible:stroke-accent-400",
                            editable && "cursor-grab active:cursor-grabbing",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect?.(at, selectionMode(event));
                          }}
                          onDoubleClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => selectPoint(event, at)}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                              onSelect?.(at, "replace");
                            }
                            if (!editable || onChange === undefined) return;
                            if (event.ctrlKey || event.metaKey || event.shiftKey) return;

                            event.currentTarget.setPointerCapture(event.pointerId);
                            dragPoint(event, at, channel);
                          }}
                          onPointerMove={(event) => {
                            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                              dragPoint(event, at, channel);
                            }
                          }}
                          onPointerUp={finishDrag}
                          onPointerCancel={finishDrag}
                        />
                      )}
                    </g>
                  ))}
                </g>
              ))}
              {draw !== null && (
                <line
                  x1={timeX(plot, size.width, time)}
                  x2={timeX(plot, size.width, time)}
                  y1={0}
                  y2={size.height}
                  className={hover === null ? "stroke-accent-400" : "stroke-surface-300"}
                  strokeWidth={1}
                  strokeDasharray={hover === null ? undefined : "3 3"}
                />
              )}
            </svg>
          )}
          {marquee !== null && <SelectionBox marquee={marquee} />}
        </div>
        {draw !== null && plot !== null && (
          <DensityEdge
            plot={plot}
            height={size.height}
            channels={[...banded.values()].filter((each) => !muted.has(each.channel))}
            levels={levels}
          />
        )}
      </div>
      <div className="flex gap-2">
        <span className={`shrink-0 ${AXIS}`} />
        <span className="relative h-3.5 min-w-0 flex-1 text-meta leading-none text-surface-500 select-none">
          {plot !== null && <TimeTicks plot={plot} />}
        </span>
        {draw !== null && (
          <span
            className="shrink-0 text-meta leading-none text-surface-500 select-none"
            style={{ width: EDGE }}
          >
            {m.workshop_bin_random_births_label()}
          </span>
        )}
      </div>
      {draw !== null && <DrawReadout draw={draw} unit={unit} muted={muted} levels={levels} />}
      {editable && plot !== null && (
        <span className="text-meta leading-none text-surface-500 select-none">
          {m.workshop_bin_curve_graph_edit_hint()}
        </span>
      )}
    </div>
  );
}

function SelectionBox({ marquee }: { marquee: Marquee }) {
  const bounds = marqueeBounds(marquee);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-sm border border-accent-400 bg-accent-500/10"
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
    />
  );
}

interface MarqueeBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function marqueeBounds(marquee: Marquee): MarqueeBounds {
  return {
    left: Math.min(marquee.start.x, marquee.current.x),
    top: Math.min(marquee.start.y, marquee.current.y),
    width: Math.abs(marquee.current.x - marquee.start.x),
    height: Math.abs(marquee.current.y - marquee.start.y),
  };
}

function canvasPoint(event: PointerEvent<HTMLDivElement>): Point {
  const box = event.currentTarget.getBoundingClientRect();

  return {
    x: Math.min(Math.max(event.clientX - box.left, 0), box.width),
    y: Math.min(Math.max(event.clientY - box.top, 0), box.height),
  };
}

function keysInside(plot: Plot, channels: readonly number[], bounds: MarqueeBounds): number[] {
  const selected = new Set<number>();

  for (const channel of channels) {
    for (const [at, point] of (plot.points[channel] ?? []).entries()) {
      const insideX = point.x >= bounds.left && point.x <= bounds.left + bounds.width;
      const insideY = point.y >= bounds.top && point.y <= bounds.top + bounds.height;

      if (insideX && insideY) selected.add(at);
    }
  }

  return [...selected].sort((left, right) => left - right);
}

function selectionMode(event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">) {
  if (event.shiftKey) return "range" as const;
  if (event.ctrlKey || event.metaKey) return "toggle" as const;

  return "replace" as const;
}

function unitShare(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function timeX(plot: Plot, width: number, time: number): number {
  return placeTime(time, { first: plot.first, last: plot.last }) * width;
}

function sameCurveKey(authored: CurveKey | undefined, pending: CurveKey): boolean {
  if (authored === undefined || !close(authored.time, pending.time)) return false;
  if (authored.values.length !== pending.values.length) return false;

  return authored.values.every((value, channel) => close(value, pending.values[channel]));
}

function close(left: number, right: number | undefined): boolean {
  if (right === undefined) return false;

  return Math.abs(left - right) <= Math.max(0.000001, Math.abs(right) * 0.000001);
}

/** Faint lines at the value ticks and the quarters, a firmer one at 0, dashes at each key. */
function Grid({ plot, size }: { plot: Plot; size: { width: number; height: number } }) {
  return (
    <g aria-hidden>
      {ticksWithin(plot.low, plot.high).map((tick) => (
        <line
          key={`v${tick}`}
          x1={0}
          x2={size.width}
          y1={plotLevel(plot, size.height, tick)}
          y2={plotLevel(plot, size.height, tick)}
          className={tick === 0 ? "stroke-surface-500" : "stroke-surface-700/60"}
          strokeWidth={1}
        />
      ))}
      {timeTicks(plot.first, plot.last).map((tick) => (
        <line
          key={`t${tick}`}
          x1={timeX(plot, size.width, tick)}
          x2={timeX(plot, size.width, tick)}
          y1={0}
          y2={size.height}
          className="stroke-surface-700/60"
          strokeWidth={1}
        />
      ))}
      {plot.at.map((x, at) => (
        <line
          key={`k${at}`}
          x1={x}
          x2={x}
          y1={0}
          y2={size.height}
          className="stroke-surface-600"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      ))}
    </g>
  );
}

/** The value axis's labels, each level with its line, the unit beside the top one. */
function ValueTicks({
  plot,
  height,
  unit,
}: {
  plot: Plot;
  height: number;
  unit: FieldUnit | null;
}) {
  const ticks = ticksWithin(plot.low, plot.high);
  const top = ticks.at(-1);
  return ticks.map((tick) => (
    <span
      key={tick}
      className="absolute right-0 -translate-y-1/2 leading-none whitespace-nowrap tabular-nums"
      style={{ top: plotLevel(plot, height, tick) }}
    >
      {axisText(tick)}
      {tick === top && unit !== null && (
        <span className="ml-0.5 text-surface-600">{UNIT_SUFFIX[unit]()}</span>
      )}
    </span>
  ));
}

/** The time axis's labels at its quarters, the outer two kept inside its ends. */
function TimeTicks({ plot }: { plot: Plot }) {
  const ticks = timeTicks(plot.first, plot.last);
  const last = ticks.length - 1;
  return ticks.map((tick, at) => (
    <span
      key={tick}
      className={twMerge(
        "absolute top-0 tabular-nums",
        at > 0 && at < last && "-translate-x-1/2",
        at === last && at > 0 && "-translate-x-full",
      )}
      style={{ left: `${placeTime(tick, { first: plot.first, last: plot.last }) * 100}%` }}
    >
      {axisText(tick)}
    </span>
  ));
}

interface DensityEdgeProps {
  plot: Plot;
  height: number;
  channels: readonly ChannelDraw[];
  /** Each channel's base at the time the edge reads. */
  levels: readonly number[];
}

/** How the births fall at one time, on the plot's own value axis, a filled step per channel. */
function DensityEdge({ plot, height, channels, levels }: DensityEdgeProps) {
  const step = (plot.high - plot.low) / EDGE_BINS;
  const y = (value: number) => plotLevel(plot, height, value).toFixed(2);

  return (
    <svg
      role="img"
      aria-label={m.workshop_bin_random_density_label()}
      width={EDGE}
      height={height}
      className="shrink-0 border-l border-surface-700"
    >
      {channels.map((channel) => {
        const density = valueDensity(
          channel,
          levels[channel.channel] ?? 0,
          { least: plot.low, most: plot.high },
          EDGE_BINS,
        );
        const edge = density.flatMap((each, bin) => {
          const x = (each * EDGE * PEAK).toFixed(2);
          const from = plot.low + bin * step;
          return [`${x},${y(from)}`, `${x},${y(from + step)}`];
        });
        return (
          <g key={channel.channel} className={STROKE[channel.channel] ?? STROKE[0]}>
            <polygon
              points={`0,${y(plot.low)} ${edge.join(" ")} 0,${y(plot.high)}`}
              fill="currentColor"
              opacity={0.3}
            />
            <polyline points={edge.join(" ")} fill="none" stroke="currentColor" strokeWidth={1} />
          </g>
        );
      })}
    </svg>
  );
}

interface SpreadProps {
  keys: readonly CurveKey[];
  plot: Plot;
  size: { width: number; height: number };
  channel: ChannelDraw | undefined;
  pinned: number | null;
}

/** One random channel's band, a split's two, and the line a pinned chance draws inside them. */
function Spread({ keys, plot, size, channel, pinned }: SpreadProps) {
  if (channel === undefined) return null;
  const x = (at: number) => plot.at[at] ?? 0;
  const y = (value: number) => plotLevel(plot, size.height, value);
  const levels = keys.map((key) => key.values[channel.channel] ?? 0);

  return (
    <>
      {channel.factors.map((range, band) => {
        const reach = levels.map((level) => spread(level, range));
        const upper = reach.map((each, at) => ({ x: x(at), y: y(each.most) }));
        const lower = reach.map((each, at) => ({ x: x(at), y: y(each.least) }));
        return (
          <polygon
            key={band}
            points={bandOf(upper, lower, size.width)}
            fill="currentColor"
            opacity={0.18}
          />
        );
      })}
      {pinned !== null && (
        <polyline
          points={lineOf(
            levels.map((level, at) => ({ x: x(at), y: y(level * factorAt(channel, pinned)) })),
            size.width,
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
    </>
  );
}

/** Every value the bands reach to, which the value axis fits along with the keys. */
function bandEdges(keys: readonly CurveKey[], banded: ReadonlyMap<number, ChannelDraw>): number[] {
  const edges: number[] = [];
  for (const channel of banded.values()) {
    for (const key of keys) {
      const level = key.values[channel.channel];
      if (level === undefined) continue;
      for (const range of channel.factors) {
        const reach = spread(level, range);
        edges.push(reach.least, reach.most);
      }
    }
  }
  return edges;
}
