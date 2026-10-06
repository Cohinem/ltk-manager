/** How long after the last step of a pan or a zoom the view counts as at rest, in milliseconds. */
export const REST_MS = 150;

/**
 * Whether a canvas's view is being panned or zoomed, which the canvas writes and its marks read.
 *
 * A mark that follows the run moves its element on every frame, and each move repaints the
 * board under it. While the view moves, the marks hold still, so the frame goes to the move.
 * A listener hears the start and the end, and places its mark once the view rests.
 *
 * The view is moving from a `touch` until `REST_MS` pass with none. No end has to be reported,
 * so a move whose end is never heard cannot leave the marks stopped.
 */
export class BoardMotion {
  private held = false;
  private rest = 0;
  private readonly listeners = new Set<() => void>();

  get moving(): boolean {
    return this.held;
  }

  /** Report one step of a pan or a zoom. */
  touch(): void {
    window.clearTimeout(this.rest);
    this.rest = window.setTimeout(() => this.set(false), REST_MS);
    this.set(true);
  }

  private set(moving: boolean): void {
    if (moving === this.held) return;

    this.held = moving;
    for (const listener of [...this.listeners]) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

type Subscribe = (listener: () => void) => () => void;

/** The marks of one run, which hear its clock through one subscription. */
interface Pace {
  readonly listeners: Set<() => void>;
  unsubscribe: (() => void) | null;
  last: number;
  trailing: number;
}

/** The marks past which they follow the run at `CROWDED_MS` rather than on every frame. */
export const CROWDED = 48;

/** How often a crowd of marks catches up with the run, in milliseconds. */
export const CROWDED_MS = 50;

/* One pace per run's `subscribe`, so every mark of a run moves in the same task. */
const PACES = new WeakMap<Subscribe, Pace>();

/**
 * Hear the run behind `subscribe` as a mark does: on every frame, or every `CROWDED_MS` once
 * more than `CROWDED` marks listen, with one trailing call so a seek that lands between two
 * ticks still reaches every mark.
 */
export function hearAsMark(subscribe: Subscribe, listener: () => void): () => void {
  let pace = PACES.get(subscribe);
  if (pace === undefined) {
    pace = { listeners: new Set(), unsubscribe: null, last: 0, trailing: 0 };
    PACES.set(subscribe, pace);
  }
  const held = pace;

  held.listeners.add(listener);
  held.unsubscribe ??= subscribe(() => tick(held));

  return () => {
    held.listeners.delete(listener);
    if (held.listeners.size > 0) return;

    held.unsubscribe?.();
    held.unsubscribe = null;
    window.clearTimeout(held.trailing);
    held.trailing = 0;
  };
}

function tick(pace: Pace): void {
  const wait = pace.listeners.size > CROWDED ? CROWDED_MS - (performance.now() - pace.last) : 0;
  if (wait <= 0) {
    notify(pace);
    return;
  }

  if (pace.trailing === 0) {
    pace.trailing = window.setTimeout(() => notify(pace), wait);
  }
}

function notify(pace: Pace): void {
  window.clearTimeout(pace.trailing);
  pace.trailing = 0;
  pace.last = performance.now();
  for (const listener of [...pace.listeners]) listener();
}
