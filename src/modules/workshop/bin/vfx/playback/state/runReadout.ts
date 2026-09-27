import { useCallback, useSyncExternalStore } from "react";

import type { Driver } from "../../engine/simulation/driver";
import { useVfxRun, type VfxRun } from "./run";

/** How often a readout of the clock catches up with it, in milliseconds. */
const READOUT_MS = 100;

/** The finest step a readout tells apart, which is what its two decimals show. */
const READOUT_STEP = 0.01;

/**
 * Where the run stands, in seconds of its phase, caught up with every `READOUT_MS`.
 *
 * The clock moves every frame and a readout is React state, so the two are kept apart:
 * a listener hears the clock at the readout's own rate, with one trailing call so a seek
 * that lands between two ticks still reaches it.
 */
export function useRunClock(): number {
  return useClockOf(useVfxRun()) ?? 0;
}

/** `useRunClock` for a caller that may sit outside a run, which hears nothing and reads null. */
export function useClockOf(run: VfxRun | null): number | null {
  return useRunReadout(run, readPhase);
}

function readPhase(driver: Driver): number {
  return driver.phase;
}

/**
 * `read` of the run's driver, caught up with every `READOUT_MS` as `useRunClock` is, and
 * null outside a run or where `read` finds nothing.
 */
export function useRunReadout(
  run: VfxRun | null,
  read: (driver: Driver) => number | null,
): number | null {
  const subscribe = run?.subscribe;
  const driver = run?.driver;
  const paced = useCallback(
    (listener: () => void) => (subscribe === undefined ? () => {} : hear(subscribe, listener)),
    [subscribe],
  );
  return useSyncExternalStore(paced, () => {
    const value = driver === undefined ? null : read(driver);
    return value === null ? null : Math.round(value / READOUT_STEP) * READOUT_STEP;
  });
}

type Subscribe = VfxRun["subscribe"];

/** The readouts of one run, which hear its clock through one subscription and one timer. */
interface Pacer {
  readonly listeners: Set<() => void>;
  unsubscribe: (() => void) | null;
  last: number;
  trailing: number;
}

/* One pacer per run's `subscribe`, so every readout of a run updates in the same task. */
const PACERS = new WeakMap<Subscribe, Pacer>();

/** Add `listener` to the pacer of `subscribe`, which hears the run while any listener is left. */
function hear(subscribe: Subscribe, listener: () => void): () => void {
  let pacer = PACERS.get(subscribe);
  if (pacer === undefined) {
    pacer = { listeners: new Set(), unsubscribe: null, last: 0, trailing: 0 };
    PACERS.set(subscribe, pacer);
  }
  const held = pacer;

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

function tick(pacer: Pacer): void {
  const wait = READOUT_MS - (performance.now() - pacer.last);
  if (wait <= 0) {
    notify(pacer);
    return;
  }

  if (pacer.trailing === 0) {
    pacer.trailing = window.setTimeout(() => notify(pacer), wait);
  }
}

function notify(pacer: Pacer): void {
  window.clearTimeout(pacer.trailing);
  pacer.trailing = 0;
  pacer.last = performance.now();
  for (const listener of [...pacer.listeners]) listener();
}
