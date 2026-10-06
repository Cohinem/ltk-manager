// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardMotion, CROWDED, CROWDED_MS, hearAsMark, REST_MS } from "../boardMotion";

/** A run's `subscribe`, and the call that plays one frame of it. */
function run() {
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const frame = () => listeners.forEach((listener) => listener());

  return { subscribe, frame, listeners };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("BoardMotion", () => {
  it("moves from its first step until the steps stop, and tells its listeners of both", async () => {
    const motion = new BoardMotion();
    const heard = vi.fn();
    const stop = motion.subscribe(heard);

    motion.touch();
    await vi.advanceTimersByTimeAsync(REST_MS - 10);
    motion.touch();
    await vi.advanceTimersByTimeAsync(REST_MS - 10);
    expect(motion.moving).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20);
    expect(motion.moving).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    motion.touch();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("hearAsMark", () => {
  it("hears every frame through one subscription while few marks listen", () => {
    const { subscribe, frame, listeners } = run();
    const marks = [vi.fn(), vi.fn()];
    const stops = marks.map((mark) => hearAsMark(subscribe, mark));

    frame();
    frame();

    expect(listeners.size).toBe(1);
    marks.forEach((mark) => expect(mark).toHaveBeenCalledTimes(2));

    stops.forEach((stop) => stop());
    expect(listeners.size).toBe(0);
  });

  it("paces a crowd of marks, and still delivers the last frame of a burst", async () => {
    const { subscribe, frame } = run();
    const marks = Array.from({ length: CROWDED + 1 }, () => vi.fn());
    const stops = marks.map((mark) => hearAsMark(subscribe, mark));
    await vi.advanceTimersByTimeAsync(1000);

    frame();
    expect(marks[0]).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10);
    frame();
    frame();
    expect(marks[0]).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CROWDED_MS);
    expect(marks[0]).toHaveBeenCalledTimes(2);
    expect(marks.at(-1)).toHaveBeenCalledTimes(2);

    stops.forEach((stop) => stop());
  });

  it("drops a pending call once the last mark stops listening", async () => {
    const { subscribe, frame } = run();
    const marks = Array.from({ length: CROWDED + 1 }, () => vi.fn());
    const stops = marks.map((mark) => hearAsMark(subscribe, mark));
    await vi.advanceTimersByTimeAsync(1000);

    frame();
    await vi.advanceTimersByTimeAsync(10);
    frame();
    stops.forEach((stop) => stop());
    await vi.advanceTimersByTimeAsync(CROWDED_MS * 2);

    expect(marks[0]).toHaveBeenCalledTimes(1);
  });
});
