import {
  ArrowCounterClockwiseIcon,
  CaretLineLeftIcon,
  CaretLineRightIcon,
  GaugeIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";

import { Button, IconButton, Separator, StepperField, Tooltip } from "@/components";
import { m, Marked } from "@/i18n";
import { twMerge, writeText } from "@/utils";

import { Scrub } from "./Scrub";

/** The digits the time is drawn to. */
const TIME_DECIMALS = 2;

/** How often the scrub's value is written for assistive technology, in milliseconds. */
const ANNOUNCE_MS = 250;

/** The rates the speed spans, slow enough to read one frame and never backwards. */
const SLOWEST = 0.05;
const FASTEST = 2;

/** What the speed field's arrows move the rate by: plain, under Alt, and under Shift. */
const SPEED_NUDGE = { step: 0.1, small: 0.01, large: 0.5 } as const;

/** The digits the speed is drawn to. */
const SPEED_DECIMALS = 3;

/** The speed reads with a point, as the `toFixed` readouts beside it do. */
const SPEED_LOCALE = "en-US";

/** The rates the bracket keys walk. */
export const SPEED_DETENTS: readonly number[] = [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2];

/** The detent below or above `speed`, by `direction`, and the end of the row past it. */
export function speedDetent(speed: number, direction: -1 | 1): number {
  const last = SPEED_DETENTS.length - 1;
  if (direction > 0) {
    return SPEED_DETENTS.find((detent) => detent > speed + 1e-6) ?? SPEED_DETENTS[last];
  }
  return [...SPEED_DETENTS].reverse().find((detent) => detent < speed - 1e-6) ?? SPEED_DETENTS[0];
}

export interface TransportProps {
  playing: boolean;
  /** What the frame's own seconds are multiplied by before the scene takes them. */
  speed: number;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  /** Drawn as a button when given. */
  onRestart?: () => void;
  /** Drawn as a step back and a step forward around play when given, in whole frames. */
  onStep?: (frames: number) => void;
  /** Whether the run starts over at its end, drawn as a toggle when `onLoopingChange` is given. */
  looping?: boolean;
  onLoopingChange?: (looping: boolean) => void;
  /** The loop switch is drawn but takes no press, for a run that never starts over. */
  loopDisabled?: boolean;
  /** `mini` is play, the scrub and the time alone, "The timeline" in docs/ux/BIN_EDITOR.md. */
  variant?: "full" | "mini";
  /**
   * The scrub and the time, which follow the host's clock.
   *
   * A [`Playhead`] the host hands its clock, which no tick of that clock re-renders.
   */
  playhead: ReactNode;
  /** What a host carries after the transport's controls, placed by the host. */
  children?: ReactNode;
  /** The host's edge, since the row sits under a viewport in one and over the lanes in another. */
  className?: string;
}

/**
 * The transport of a run, in two groups a hairline divides.
 *
 * The first moves the playhead: the steps, play and restart around the time. The second is
 * how the run plays: the loop and the speed. Play is the one filled control, so the row
 * reads from it outward.
 */
export function Transport({
  playing,
  speed,
  onPlayingChange,
  onSpeedChange,
  onRestart,
  onStep,
  looping = false,
  onLoopingChange,
  loopDisabled = false,
  variant = "full",
  playhead,
  children,
  className,
}: TransportProps) {
  const mini = variant === "mini";
  const steps = !mini && onStep !== undefined;
  const loops = onLoopingChange !== undefined;

  return (
    <div
      data-ui="Transport"
      className={twMerge("flex shrink-0 items-center gap-1.5 px-2 py-1 select-none", className)}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        {steps && (
          <StepButton label={m.workshop_bin_preview_step_back_action()} onClick={() => onStep(-1)}>
            <CaretLineLeftIcon weight="bold" className="size-4" />
          </StepButton>
        )}
        <PlayButton playing={playing} onPlayingChange={onPlayingChange} />
        {steps && (
          <StepButton
            label={m.workshop_bin_preview_step_forward_action()}
            onClick={() => onStep(1)}
          >
            <CaretLineRightIcon weight="bold" className="size-4" />
          </StepButton>
        )}
        {!mini && onRestart && (
          <StepButton label={m.workshop_bin_preview_restart_action()} onClick={onRestart}>
            <ArrowCounterClockwiseIcon weight="bold" className="size-4" />
          </StepButton>
        )}
      </div>

      {playhead}

      {(loops || !mini) && <Separator orientation="vertical" className="mx-1 h-4" />}

      <div className="flex shrink-0 items-center gap-1.5">
        {loops && (
          <LoopToggle looping={looping} disabled={loopDisabled} onLoopingChange={onLoopingChange} />
        )}
        {!mini && <SpeedField speed={speed} onSpeedChange={onSpeedChange} />}
      </div>

      {children}
    </div>
  );
}

/** Play or pause, the transport's one filled control. */
function PlayButton({
  playing,
  onPlayingChange,
}: Pick<TransportProps, "playing" | "onPlayingChange">) {
  const label = playing
    ? m.workshop_bin_preview_pause_action()
    : m.workshop_bin_preview_play_action();
  const hint = playing ? m.workshop_bin_preview_pause_hint() : m.workshop_bin_preview_play_hint();
  const Glyph = playing ? PauseIcon : PlayIcon;

  return (
    <IconButton
      variant="filled"
      aria-label={label}
      icon={<Glyph weight="fill" />}
      onClick={() => onPlayingChange(!playing)}
      tooltip={hint}
    />
  );
}

/** The loop switch, lit while the run starts over at its end. */
function LoopToggle({
  looping,
  disabled,
  onLoopingChange,
}: {
  looping: boolean;
  disabled: boolean;
  onLoopingChange: (looping: boolean) => void;
}) {
  const hint = disabled
    ? m.workshop_bin_preview_loop_continuous_hint()
    : m.workshop_bin_preview_loop_hint();

  return (
    <IconButton
      aria-label={m.workshop_bin_preview_loop_label()}
      pressed={looping}
      disabled={disabled}
      muted
      icon={<RepeatIcon />}
      onClick={() => onLoopingChange(!looping)}
      tooltip={hint}
    />
  );
}

/** The rate typed to three places, under the gauge that names it. */
function SpeedField({ speed, onSpeedChange }: Pick<TransportProps, "speed" | "onSpeedChange">) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Tooltip content={m.workshop_bin_preview_speed_label()}>
        <span className="flex shrink-0">
          <GaugeIcon aria-hidden className="size-3.5 text-surface-400" />
        </span>
      </Tooltip>
      <StepperField
        className="w-20 text-meta"
        aria-label={m.workshop_bin_preview_speed_label()}
        increaseLabel={m.workshop_bin_preview_speed_up_action()}
        decreaseLabel={m.workshop_bin_preview_speed_down_action()}
        value={speed}
        min={SLOWEST}
        max={FASTEST}
        step={SPEED_NUDGE.step}
        smallStep={SPEED_NUDGE.small}
        largeStep={SPEED_NUDGE.large}
        decimals={SPEED_DECIMALS}
        locale={SPEED_LOCALE}
        onValueChange={onSpeedChange}
      />
    </span>
  );
}

export interface PlayheadProps {
  /** Where the run stands, in seconds, read every frame. */
  read: () => number;
  /** The window the scrub spans, and none to hold the scrub still. */
  span: number;
  /** The row carries a scrub, which a host drawing a ruler of its own leaves out. */
  scrub?: boolean;
  /** Stand the run at `time`, live under a drag. */
  onSeek: (time: number) => void;
  /** Commit `time` once a drag is released or a key has moved the scrub. */
  onSeekCommit?: (time: number) => void;
  /** Classes of the scrub, which a host with a crowded row gives a least length. */
  scrubClassName?: string;
}

/**
 * The scrub and the time readout, which are the transport's two readers of the clock.
 *
 * Both follow the clock every frame through writes to the DOM outside React's render, as
 * the timeline's playhead does. A drag seeks on every pointer move, which the checkpoints
 * of decision 2.46 in docs/plans/vfx-particle-renderer.md make cheap.
 */
export function Playhead({
  read,
  span,
  scrub = true,
  onSeek,
  onSeekCommit,
  scrubClassName,
}: PlayheadProps) {
  const rail = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const announcedAt = useRef(0);

  /* No dependencies, so the frame after a render writes over whatever that render drew. */
  useLayoutEffect(() => {
    let frame = 0;
    let painted = Number.NaN;

    const paint = () => {
      frame = requestAnimationFrame(paint);
      const time = Math.min(read(), span);
      const text = time.toFixed(TIME_DECIMALS);
      const stamp = performance.now();
      if (stamp - announcedAt.current >= ANNOUNCE_MS) {
        announcedAt.current = stamp;
        rail.current?.setAttribute("aria-valuenow", text);
      }
      if (time === painted) return;

      painted = time;
      rail.current?.style.setProperty("--scrub", `${span > 0 ? time / span : 0}`);
      if (now.current !== null) writeText(now.current, text);
    };
    paint();

    return () => cancelAnimationFrame(frame);
  });

  return (
    <>
      {scrub && (
        <Scrub
          ref={rail}
          className={twMerge("mx-2 min-w-0 flex-1", scrubClassName)}
          label={m.workshop_bin_preview_scrub_label()}
          read={read}
          span={span}
          onSeek={onSeek}
          onSeekCommit={onSeekCommit}
        />
      )}
      <span
        role="timer"
        aria-label={m.workshop_bin_preview_readout_label()}
        className="shrink-0 px-1 font-mono text-mono-row whitespace-nowrap text-surface-400 tabular-nums"
      >
        <Marked
          text={m.workshop_bin_preview_playhead_label({
            time: (0).toFixed(TIME_DECIMALS),
            span: span.toFixed(TIME_DECIMALS),
          })}
        >
          {(time) => (
            <span ref={now} className="font-medium text-surface-100">
              {time}
            </span>
          )}
        </Marked>
      </span>
    </>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <Button variant="ghost" size="xs" aria-label={label} onClick={onClick}>
        {children}
      </Button>
    </Tooltip>
  );
}
