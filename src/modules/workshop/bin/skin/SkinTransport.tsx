import { CaretRightIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Code, Select, Slider, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { GraphClip } from "@/lib/tauri";
import { type SceneClock, sequenceStep } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { Playhead, Transport } from "../vfx/Transport";
import { foldedTime } from "./follow";
import { BIND_POSE, nearestValue } from "./skinScene";

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
        {/* The clip's own controls take a row of their own under a pane too narrow for
            the scrub to keep a usable length beside them. */}
        <span
          data-ui="SkinTransport:clip"
          className={twMerge(
            "flex min-w-0 basis-full items-center gap-2",
            "@4xl:ml-auto @4xl:basis-auto",
          )}
        >
          {clips.length > 0 && (
            <ClipPicker clips={clips} value={clip} onValueChange={onClipChange} />
          )}
          {parameter !== null && (
            <ParameterSlider parameter={parameter} onValueChange={onParameterChange} />
          )}
          <Leaf steps={steps} clip={clip} time={readout} />
        </span>
      </Transport>
    </div>
  );
}

interface ClipPickerProps {
  clips: readonly GraphClip[];
  /** A clip's hash, or `BIND_POSE`. */
  value: string;
  onValueChange: (value: string) => void;
}

/** Which clip of the graph poses the skin, or none. */
function ClipPicker({ clips, value, onValueChange }: ClipPickerProps) {
  const nameOf = (held: string | null) => {
    if (held === BIND_POSE) return m.workshop_bin_mesh_preview_bind_label();
    const clip = clips.find((each) => each.hash === held);
    return clip === undefined ? "" : clip.name;
  };

  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <Select.Trigger
        aria-label={m.workshop_bin_mesh_preview_clip_label()}
        className="h-7 w-44 shrink-0 gap-1 px-2 text-meta"
      >
        <Select.Value className="truncate">{nameOf}</Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Item value={BIND_POSE}>{m.workshop_bin_mesh_preview_bind_label()}</Select.Item>
            {clips.map((clip) => (
              <Select.Item key={clip.hash} value={clip.hash}>
                {clip.name}
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
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
          <SlidersHorizontalIcon aria-hidden className="h-3.5 w-3.5 text-surface-400" />
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

interface LeafProps {
  steps: readonly PlayingStep[];
  clip: string;
  time: number;
}

/** The atomic clip playing under a composite one, and nothing where the picked clip is atomic. */
function Leaf({ steps, clip, time }: LeafProps) {
  if (steps.length === 0) return null;
  const leaf =
    steps[
      sequenceStep(
        steps.map((step) => step.duration),
        time,
      )
    ];
  if (steps.length === 1 && leaf.hash === clip) return null;

  return (
    <span
      className="flex min-w-0 items-center gap-1 text-meta"
      aria-label={m.workshop_bin_clip_playing_label({ name: leaf.name })}
    >
      <CaretRightIcon weight="bold" className="h-3 w-3 shrink-0 text-surface-500" />
      {/* DS-CODE-CHIP */}
      <Code className="min-w-0 truncate text-surface-300">{leaf.name}</Code>
    </span>
  );
}
