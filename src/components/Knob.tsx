import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";

import { twMerge } from "@/utils";

import { focusRing } from "./focus";
import {
  continueGesture,
  draggedValue,
  gestureCommit,
  type KnobGesture,
  keyedValue,
  wheeledValue,
} from "./knobValue";

export interface KnobProps {
  /** The value the knob points at. Held by the caller. */
  value: number;
  min: number;
  max: number;
  /** The change of one arrow key. Shift moves a tenth of it. */
  step?: number;
  /** The value that a double click resets to, and where the value arc starts. Defaults to `min`. */
  defaultValue?: number;
  /** Takes every value a gesture passes through. */
  onChange: (value: number) => void;
  /** Takes the value at the end of a drag, a key run or a wheel run, once per gesture. */
  onCommit?: (value: number) => void;
  /** The unit that `aria-valuetext` reads after the value, such as `dB`. */
  unit?: string;
  /** Returns the text of a value for `aria-valuetext`. Defaults to the number. */
  format?: (value: number) => string;
  disabled?: boolean;
  "aria-label": string;
  className?: string;
}

/** The milliseconds without a key or a wheel step after which a run of them ends. */
const RUN_IDLE_MS = 400;

/** The half of the sweep on each side of the top, in degrees. */
const HALF_SWEEP = 135;

/** The centre and the radius of the arcs in the 24-unit view box. */
const CENTER = 12;
const RADIUS = 9;

/**
 * A bounded number turned by a vertical drag, the wheel or the keys, as a dial.
 *
 * It follows the slider contract: `role="slider"`, the arrows step, the Page keys move a tenth of
 * the range, Home and End go to the bounds and Shift steps finer. A double click resets to
 * `defaultValue`. Each drag, key run and wheel run calls `onCommit` once at its end, so one
 * gesture is one undo step for a caller that writes on commit. The value arc grows from
 * `defaultValue`, so a bipolar range reads its sign.
 */
export function Knob({
  value,
  min,
  max,
  step = 1,
  defaultValue = min,
  onChange,
  onCommit,
  unit,
  format = String,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: KnobProps) {
  const range = { min, max, step };
  const gesture = useRef<KnobGesture | null>(null);
  const drag = useRef<{ startY: number; startValue: number } | null>(null);
  const idle = useRef<number | undefined>(undefined);
  const root = useRef<HTMLSpanElement>(null);
  const latest = useRef({ value, onChange, onCommit, range, disabled });
  latest.current = { value, onChange, onCommit, range, disabled };

  useEffect(() => () => window.clearTimeout(idle.current), []);

  function move(next: number) {
    gesture.current = continueGesture(gesture.current, latest.current.value, next);
    if (next !== latest.current.value) latest.current.onChange(next);
  }

  function end() {
    window.clearTimeout(idle.current);
    const committed = gestureCommit(gesture.current);
    gesture.current = null;
    if (committed !== null) latest.current.onCommit?.(committed);
  }

  function endAfterIdle() {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(end, RUN_IDLE_MS);
  }

  /* React attaches `wheel` as passive, which cannot cancel the page scroll. */
  useEffect(() => {
    const element = root.current;
    if (element === null) return;

    function wheel(event: WheelEvent) {
      const { disabled: off, value: current, range: bounds } = latest.current;
      if (off) return;

      event.preventDefault();
      move(wheeledValue(current, event.deltaY, bounds, event.shiftKey));
      endAfterIdle();
    }

    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the props through `latest`.
  }, []);

  function keys(event: ReactKeyboardEvent<HTMLSpanElement>) {
    const next = keyedValue(value, event.key, range, event.shiftKey);
    if (next === null) return;

    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(idle.current);
    move(next);
  }

  function pointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startValue: value };
  }

  function pointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (drag.current === null) return;

    const { startY, startValue } = drag.current;
    move(draggedValue(startValue, event.clientY - startY, range, event.shiftKey));
  }

  function pointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    if (drag.current === null) return;

    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    end();
  }

  function reset() {
    end();
    if (defaultValue === value) return;

    onChange(defaultValue);
    onCommit?.(defaultValue);
  }

  const shown = Math.min(max, Math.max(min, value));
  const origin = Math.min(max, Math.max(min, defaultValue));
  const valueText = unit === undefined ? format(value) : `${format(value)} ${unit}`;

  return (
    <span
      ref={root}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      aria-orientation="vertical"
      data-ui="Knob"
      className={twMerge(
        "inline-flex size-5 shrink-0 touch-none items-center justify-center rounded-full",
        focusRing,
        disabled ? "pointer-events-none opacity-50" : "cursor-ns-resize",
        className,
      )}
      onKeyDown={disabled ? undefined : keys}
      onKeyUp={disabled ? undefined : endAfterIdle}
      onBlur={end}
      onPointerDown={disabled ? undefined : pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!disabled) reset();
      }}
    >
      <svg viewBox="0 0 24 24" className="size-full" aria-hidden>
        {/* DS-VEIL: the track has no surface of its own, so it draws from the veil. */}
        <path
          d={arcPath(-HALF_SWEEP, HALF_SWEEP)}
          className="fill-none stroke-surface-veil-strong"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {shown !== origin && (
          <path
            d={arcPath(angleOf(origin, min, max), angleOf(shown, min, max))}
            className="fill-none stroke-accent-500"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}
        <line
          x1={pointAt(angleOf(shown, min, max), 2).x}
          y1={pointAt(angleOf(shown, min, max), 2).y}
          x2={pointAt(angleOf(shown, min, max), RADIUS - 2).x}
          y2={pointAt(angleOf(shown, min, max), RADIUS - 2).y}
          className="stroke-surface-200"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Returns the angle of `value` in degrees from the top, clockwise, over the sweep. */
function angleOf(value: number, min: number, max: number): number {
  if (max === min) return -HALF_SWEEP;

  return -HALF_SWEEP + ((value - min) / (max - min)) * HALF_SWEEP * 2;
}

/** Returns the point at `angle` degrees from the top and `radius` units from the centre. */
function pointAt(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;

  return { x: CENTER + radius * Math.sin(radians), y: CENTER - radius * Math.cos(radians) };
}

/** Returns the SVG path of the arc between two angles, drawn clockwise from the lower one. */
function arcPath(from: number, to: number): string {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const a = pointAt(start, RADIUS);
  const b = pointAt(end, RADIUS);
  const large = end - start > 180 ? 1 : 0;

  return `M ${a.x} ${a.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${b.x} ${b.y}`;
}
