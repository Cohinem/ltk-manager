import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { useVfxRun } from "../../playback/state/run";
import { type TimeWindow, xOf } from "../utils/laneModel";

/** The width of a line's time chip, in pixels. */
const FLAG = 36;

/**
 * One time drawn as a line in the ruler, with its chip, and a line over the lanes at once.
 * `stand` and `hide` write to the DOM outside React's render.
 */
export interface TimeLine {
  readonly flag: RefObject<HTMLDivElement | null>;
  readonly chip: RefObject<HTMLSpanElement | null>;
  readonly track: RefObject<HTMLDivElement | null>;
  /** Stand the line at `x` with its chip reading `time`, hidden while `x` is off `width`. */
  readonly stand: (x: number, width: number, time: number) => void;
  readonly hide: () => void;
}

/** Stand `chip` over `x`, held inside the ruler's `width` so it never clips at an end. */
function placeChip(chip: HTMLElement, x: number, width: number): void {
  const offset = Math.min(Math.max(-FLAG / 2, -x), width - x - FLAG);
  chip.style.transform = `translateX(${offset}px)`;
}

/** A time line's elements and its writers. */
export function useTimeLine(): TimeLine {
  const flag = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLDivElement>(null);

  const stand = useCallback((x: number, width: number, time: number) => {
    const shown = x >= 0 && x <= width;
    for (const line of [flag.current, track.current]) {
      if (line === null) continue;

      line.style.visibility = shown ? "visible" : "hidden";
      line.style.transform = `translateX(${x}px)`;
    }

    const label = chip.current;
    if (label === null || !shown) return;

    label.textContent = time.toFixed(2);
    placeChip(label, x, width);
  }, []);

  const hide = useCallback(() => {
    for (const line of [flag.current, track.current]) {
      if (line !== null) line.style.visibility = "hidden";
    }
  }, []);

  return useMemo(() => ({ flag, chip, track, stand, hide }), [stand, hide]);
}

/** The run's playhead, which follows its clock every frame. */
export function usePlayhead(view: TimeWindow, width: number): TimeLine {
  const { driver, subscribe } = useVfxRun();
  const line = useTimeLine();
  const { stand } = line;

  useLayoutEffect(() => {
    const paint = () => stand(xOf(view, width, driver.phase), width, driver.phase);
    paint();
    return subscribe(paint);
  }, [driver, subscribe, stand, view, width]);

  return line;
}

interface PlayheadFlagProps {
  line: TimeLine;
  onScrubStart: () => void;
  /** Seek to where the pointer stands, by its `clientX`. */
  onScrub: (clientX: number) => void;
  onScrubEnd: () => void;
}

/** The playhead's line in the ruler, whose chip scrubs the run from a drag on it. */
export function PlayheadFlag({ line, onScrubStart, onScrub, onScrubEnd }: PlayheadFlagProps) {
  const scrubbing = useRef(false);
  const stop = () => {
    if (!scrubbing.current) return;

    scrubbing.current = false;
    onScrubEnd();
  };

  return (
    <div
      ref={line.flag}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-px bg-accent-400"
    >
      <span
        ref={line.chip}
        data-ui="Lanes:flag"
        /* DS-INVARIANT */
        className="pointer-events-auto absolute top-px left-0 flex h-3.5 cursor-ew-resize touch-none items-center justify-center rounded-sm bg-accent-500 font-mono text-meta leading-none text-brand-on tabular-nums shadow-sm"
        style={{ width: FLAG }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.button !== 0) return;

          event.currentTarget.setPointerCapture(event.pointerId);
          scrubbing.current = true;
          onScrubStart();
        }}
        onPointerMove={(event) => {
          if (scrubbing.current) onScrub(event.clientX);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
    </div>
  );
}

/** The playhead's line over the lanes. */
export function PlayheadLine({ line }: { line: TimeLine }) {
  return (
    <div
      ref={line.track}
      className="absolute inset-y-0 left-0 w-px bg-accent-400 shadow-[0_0_6px_var(--color-accent-500)]"
    />
  );
}

/** The pointer's line in the ruler, reading where a press would seek. */
export function PointerFlag({ line }: { line: TimeLine }) {
  return (
    <div
      ref={line.flag}
      aria-hidden="true"
      className="pointer-events-none invisible absolute inset-y-0 left-0 border-l border-dashed border-surface-400/60"
    >
      <span
        ref={line.chip}
        className="absolute top-px left-0 flex h-3.5 items-center justify-center rounded-sm bg-surface-700 font-mono text-meta leading-none text-surface-200 tabular-nums"
        style={{ width: FLAG }}
      />
    </div>
  );
}

/** The pointer's line over the lanes. */
export function PointerLine({ line }: { line: TimeLine }) {
  return (
    <div
      ref={line.track}
      className="invisible absolute inset-y-0 left-0 border-l border-dashed border-surface-400/50"
    />
  );
}
