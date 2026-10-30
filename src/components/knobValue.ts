/** The bounds and the step of a knob. */
export interface KnobRange {
  readonly min: number;
  readonly max: number;
  /** The change of one arrow key, and the grid that a drag rounds to. */
  readonly step: number;
}

/** The pixels of vertical drag that turn a knob from its minimum to its maximum. */
const DRAG_SPAN_PX = 200;

/** A fine gesture, with Shift held, moves this many times less and rounds this many times finer. */
const FINE_DIVISOR = 10;

/**
 * Returns the value that a vertical drag of `deltaY` pixels from `start` turns a knob to.
 *
 * An upward drag, a negative `deltaY`, raises the value.
 */
export function draggedValue(
  start: number,
  deltaY: number,
  range: KnobRange,
  fine: boolean,
): number {
  const divisor = fine ? FINE_DIVISOR : 1;
  const moved = (-deltaY / DRAG_SPAN_PX) * (range.max - range.min);

  return snapped(start + moved / divisor, range, range.step / divisor);
}

/** A Page key moves this fraction of the range. */
const PAGE_FRACTION = 0.1;

/**
 * Returns the value that `key` turns a knob at `value` to.
 *
 * The arrows move one step, or a tenth of one if `fine`. Page Up and Page Down move a tenth of the
 * range, and Home and End go to the bounds. Returns null for any other key.
 */
export function keyedValue(
  value: number,
  key: string,
  range: KnobRange,
  fine: boolean,
): number | null {
  const step = fine ? range.step / FINE_DIVISOR : range.step;
  const page = (range.max - range.min) * PAGE_FRACTION;

  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return snapped(value + step, range, step);
    case "ArrowDown":
    case "ArrowLeft":
      return snapped(value - step, range, step);
    case "PageUp":
      return snapped(value + page, range, step);
    case "PageDown":
      return snapped(value - page, range, step);
    case "Home":
      return range.min;
    case "End":
      return range.max;
    default:
      return null;
  }
}

/** Returns the value that one wheel event of `deltaY` turns a knob at `value` to: one step. */
export function wheeledValue(
  value: number,
  deltaY: number,
  range: KnobRange,
  fine: boolean,
): number {
  if (deltaY === 0) return value;

  const step = fine ? range.step / FINE_DIVISOR : range.step;
  return snapped(value - Math.sign(deltaY) * step, range, step);
}

/** One drag, key run or wheel run: the value it started at and the value it reached. */
export interface KnobGesture {
  readonly from: number;
  readonly to: number;
}

/** Returns `gesture` moved from `value` to `next`, or a new gesture that starts at `value`. */
export function continueGesture(
  gesture: KnobGesture | null,
  value: number,
  next: number,
): KnobGesture {
  return { from: gesture?.from ?? value, to: next };
}

/** Returns the value that the end of `gesture` commits, or null if it ends where it started. */
export function gestureCommit(gesture: KnobGesture | null): number | null {
  if (gesture === null || gesture.to === gesture.from) return null;

  return gesture.to;
}

/** Returns `value` rounded to a whole `grid` from `range.min` and held inside the bounds. */
function snapped(value: number, range: KnobRange, grid: number): number {
  const steps = Math.round((value - range.min) / grid);
  const stepped = Number((range.min + steps * grid).toPrecision(12));

  return Math.min(range.max, Math.max(range.min, stepped));
}
