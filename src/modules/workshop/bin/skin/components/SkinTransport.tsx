import { FilmStripIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Select, Slider, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { GraphClip } from "@/lib/tauri";
import { type SceneClock, sequenceStep } from "@/modules/viewport";

import { Playhead, Transport } from "../../vfx/playback/components/Transport";
import { foldedTime } from "../utils/follow";
import { BIND_POSE, nearestValue } from "../utils/skinScene";

/** How often the readout catches up with the clock, in milliseconds. */
const READOUT_MS = 100;

/** One atomic clip of what the chosen clip plays, and how long its pass lasts. */
export interface PlayingStep {
  readonly hash: string;
  readonly name: string;
  readonly duration: number;
}

export interface SkinTransportProps {
  /** The scene's clock, which the scrub sets and the readout follows. */
  clock: SceneClock;
  /** Seconds one pass of the clip lasts, and zero for the bind pose. */
  duration: number;
  playing: boolean;
  /** What the frame's own seconds are multiplied by before the clock takes them. */
  speed: number;
  /** The clips the picker offers: every one whose playlist reaches a file. */
  clips: readonly GraphClip[];
  /** The clip posing the skin: a clip's hash, or `BIND_POSE`. */
  clip: string;
  /** The atomic clips `clip` plays in order, which the readout names the current one of. */
  steps: readonly PlayingStep[];
  /** The value a parametric clip plays at and the span its pairs cover, and null for any other clip. */
  parameter: Parameter | null;
  onParameterChange: (value: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onClipChange: (clip: string) => void;
}

/** Where a parametric clip's parameter stands, among the values its pairs play at. */
export interface Parameter {
  /** One of `values`. */
  readonly value: number;
  /** Each pair's value once, in order, two or more of them. */
  readonly values: readonly number[];
}

/** How finely the slider reads a drag before it snaps, as a share of the span. */
const PARAMETER_STEPS = 100;

/** The decimals a tick's label is written to where its value is not whole. */
const PARAMETER_DECIMALS = 1;

/**
 * The transport under the skin, with the clip it poses and the atomic clip that plays.
 *
 * The readout is this bar's own state, so catching it up with the clock redraws the bar
 * and not the scene above it.
 */
export function SkinTransport({
  clock,
  duration,
  playing,
  speed,
  clips,
  clip,
  steps,
  parameter,
  onParameterChange,
  onPlayingChange,
  onSpeedChange,
  onClipChange,
}: SkinTransportProps) {
  const [readout, setReadout] = useState(() => clock.time);
  useEffect(() => {
    const timer = window.setInterval(() => setReadout(clock.time), READOUT_MS);
    return () => window.clearInterval(timer);
  }, [clock]);

  return (
    <div className="@container shrink-0">
      <Transport
        className="flex-wrap border-t border-surface-700/50"
        playing={playing}
        speed={speed}
        onPlayingChange={onPlayingChange}
        onSpeedChange={onSpeedChange}
        playhead={
          <Playhead
            time={foldedTime(readout, duration)}
            span={duration}
            scrubClassName="min-w-48"
            onSeek={(time) => {
              clock.seek(time);
              setReadout(time);
            }}
          />
        }
        onRestart={() => {
          clock.restart();
          setReadout(0);
        }}
      >
        <span data-ui="SkinTransport:clip" className="flex min-w-0 items-center gap-2">
          {clips.length > 0 && (
            <ClipPicker
              clips={clips}
              value={clip}
              playing={playingLeaf(steps, clip, readout)}
              onValueChange={onClipChange}
            />
          )}
          {parameter !== null && (
            <ParameterSlider parameter={parameter} onValueChange={onParameterChange} />
          )}
        </span>
      </Transport>
    </div>
  );
}

interface ClipPickerProps {
  clips: readonly GraphClip[];
  /** A clip's hash, or `BIND_POSE`. */
  value: string;
  /** The atomic clip playing under a composite one, by name, and null for none. */
  playing: string | null;
  onValueChange: (value: string) => void;
}

/** Which clip of the graph poses the skin, or none, with the clip playing now as its tooltip. */
function ClipPicker({ clips, value, playing, onValueChange }: ClipPickerProps) {
  const nameOf = (held: string | null) => {
    if (held === BIND_POSE) return m.workshop_bin_mesh_preview_bind_label();
    const clip = clips.find((each) => each.hash === held);
    return clip === undefined ? "" : clip.name;
  };

  const picker = (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      {/* DS-VEIL */}
      <Select.Trigger
        aria-label={m.workshop_bin_mesh_preview_clip_label()}
        size="sm"
        className="w-auto max-w-44 min-w-0 gap-1.5 border-transparent bg-transparent text-surface-100 hover:border-transparent hover:bg-surface-veil"
      >
        <FilmStripIcon aria-hidden className="size-3.5 shrink-0 text-surface-400" />
        <Select.Value className="truncate">{nameOf}</Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={BIND_POSE}>{m.workshop_bin_mesh_preview_bind_label()}</Select.Item>
        {clips.map((clip) => (
          <Select.Item key={clip.hash} value={clip.hash}>
            {clip.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
  if (playing === null) return picker;

  return (
    <Tooltip content={m.workshop_bin_clip_playing_label({ name: playing })}>
      <span className="flex min-w-0">{picker}</span>
    </Tooltip>
  );
}

/**
 * The value a parametric clip plays at, one of the values its pairs play at, each a tick
 * along the slider.
 *
 * Decision 32 of docs/plans/animation-graph-table.md: the preview snaps to the pair
 * nearest the value rather than blending the two around it, so a drag lands on a tick and
 * nothing between two of them is offered.
 */
function ParameterSlider({
  parameter,
  onValueChange,
}: {
  parameter: Parameter;
  onValueChange: (value: number) => void;
}) {
  const { value, values } = parameter;
  const min = values[0];
  const max = values[values.length - 1];
  const marks = useMemo(
    () => values.map((each) => ({ value: each, label: parameterLabel(each) })),
    [values],
  );
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Tooltip content={m.workshop_bin_clip_parameter_label()}>
        <span className="flex shrink-0">
          <SlidersHorizontalIcon aria-hidden className="size-3.5 text-surface-400" />
        </span>
      </Tooltip>
      {/* The ruler the library sizes its cards with: a tick per value, the one held lit. */}
      <Slider
        variant="ruler"
        className="w-40 @4xl:w-56"
        aria-label={m.workshop_bin_clip_parameter_label()}
        value={value}
        min={min}
        max={max}
        step={(max - min) / PARAMETER_STEPS}
        marks={marks}
        onValueChange={(dragged) => onValueChange(nearestValue(values, dragged))}
      />
    </span>
  );
}

/** A pair's value as its tick reads: whole where it is whole, else to one decimal. */
function parameterLabel(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(PARAMETER_DECIMALS);
}

/** The atomic clip a composite one plays at `time`, by name, and null for an atomic pick. */
function playingLeaf(steps: readonly PlayingStep[], clip: string, time: number): string | null {
  if (steps.length === 0) return null;
  const leaf =
    steps[
      sequenceStep(
        steps.map((step) => step.duration),
        time,
      )
    ];
  if (steps.length === 1 && leaf.hash === clip) return null;
  return leaf.name;
}
