import { type KeyboardEvent, type PointerEvent, type Ref, useRef } from "react";

import { focusRing } from "@/components";
import { twMerge } from "@/utils";

/** How finely the scrub divides the window it spans, in seconds. */
const SCRUB_STEP = 1 / 60;

/** How many steps a page key moves, and an arrow under Shift. */
const LARGE_STEPS = 6;

/** The steps each key moves the scrub by. */
const KEY_STEPS: Partial<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -LARGE_STEPS,
  PageUp: LARGE_STEPS,
};

export interface ScrubProps {
  /** The element whose `--scrub` share the host writes every frame, and its `aria-valuenow`. */
  ref: Ref<HTMLDivElement>;
  label: string;
  /** Where the run stands, in seconds, which a key moves from. */
  read: () => number;
  /** The window the scrub spans, and none to hold the scrub still. */
  span: number;
  /** Stand the run at `time`, live under a drag. */
  onSeek: (time: number) => void;
  /** Commit `time` once a drag is released or a key has moved the scrub. */
  onSeekCommit?: (time: number) => void;
  className?: string;
}

/**
 * The rail a run is scrubbed along, with the playhead as a line over it.
 *
 * It draws from `--scrub`, the share of the span the run stands at, which the host writes
 * outside React's render. A press seeks from where it lands, and a drag keeps the pointer
 * past either end of the rail.
 */
export function Scrub({ ref, label, read, span, onSeek, onSeekCommit, className }: ScrubProps) {
  const held = useRef<number | null>(null);
  const disabled = span <= 0;

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    const time = Math.min(Math.round((share * span) / SCRUB_STEP) * SCRUB_STEP, span);

    held.current = time;
    onSeek(time);
  };

  const letGo = () => {
    const time = held.current;
    if (time === null) return;

    held.current = null;
    onSeekCommit?.(time);
  };

  const keyTime = (event: KeyboardEvent): number | null => {
    if (event.key === "Home") return 0;
    if (event.key === "End") return span;

    const steps = KEY_STEPS[event.key];
    if (steps === undefined) return null;

    const moved = read() + steps * (event.shiftKey ? LARGE_STEPS : 1) * SCRUB_STEP;
    return Math.min(Math.max(moved, 0), span);
  };

  return (
    <div
      ref={ref}
      role="slider"
      data-ui="Scrub"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={span}
      aria-valuenow={0}
      aria-disabled={disabled}
      className={twMerge(
        "group/scrub @container relative h-6 touch-none rounded-sm",
        focusRing,
        disabled ? "pointer-events-none opacity-50" : "cursor-ew-resize",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;

        event.currentTarget.setPointerCapture(event.pointerId);
        drag(event);
      }}
      onPointerMove={(event) => {
        if (held.current !== null) drag(event);
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onKeyDown={(event) => {
        const time = keyTime(event);
        if (time === null) return;

        event.preventDefault();
        onSeek(time);
        onSeekCommit?.(time);
      }}
    >
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-sm bg-surface-700 transition-[height] group-hover/scrub:h-1.5 group-active/scrub:h-1.5">
        <span className="absolute inset-0 origin-left scale-x-(--scrub) bg-accent-500" />
      </span>
      {!disabled && (
        /* A translate, since a box placed by `left` snaps to whole pixels and steps unevenly. */
        <span className="absolute inset-y-1 left-0 w-0.5 translate-x-[calc(var(--scrub)*100cqw_-_50%)] bg-accent-400 shadow-[0_0_6px_var(--color-accent-500)]" />
      )}
    </div>
  );
}
