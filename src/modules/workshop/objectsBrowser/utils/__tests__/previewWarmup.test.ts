import { expect, it, vi } from "vitest";

import { createPreviewWarmup } from "../previewWarmup";

it("holds the first visible burst instead of stepping past a short effect", () => {
  let steps = 0;
  const warmup = createPreviewWarmup(
    () => {
      steps += 1;
    },
    () => 0,
    () => steps === 2,
  );
  warmup.run();
  expect(warmup.ready).toBe(true);
  expect(steps).toBe(2);
});

it("samples 0.8 seconds in three inexpensive frames instead of waiting for wall time", () => {
  const advance = vi.fn();
  const warmup = createPreviewWarmup(advance, () => 0);
  warmup.run();
  expect(advance).toHaveBeenCalledTimes(8);
  expect(warmup.ready).toBe(false);
  warmup.run();
  warmup.run();
  expect(warmup.ready).toBe(true);
  expect(advance).toHaveBeenCalledTimes(24);
  expect(advance.mock.calls.reduce((sum, [seconds]) => sum + seconds, 0)).toBeCloseTo(0.8);
  warmup.run();
  expect(advance).toHaveBeenCalledTimes(24);
});

it("yields after an expensive simulation step consumes the frame budget", () => {
  let time = 0;
  const advance = vi.fn(() => {
    time += 3;
  });
  const warmup = createPreviewWarmup(advance, () => time);
  warmup.run();
  expect(advance).toHaveBeenCalledOnce();
  expect(warmup.ready).toBe(false);
});
