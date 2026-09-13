import { describe, expect, it } from "vitest";

import { createSceneClock } from "@/modules/viewport";

import { foldedTime, followClock, followCue, following } from "../follow";

/** A driver that records what it was asked to do, and moves its clock as a real one does. */
function recorder() {
  const calls: string[] = [];
  let time = 0;
  return {
    calls,
    get time() {
      return time;
    },
    advance(seconds: number) {
      calls.push(`advance ${seconds}`);
      time += seconds;
    },
    seek(to: number) {
      calls.push(`seek ${to}`);
      time = to;
    },
    restart() {
      calls.push("restart");
      time = 0;
    },
  };
}

describe("foldedTime", () => {
  it("folds a clock that ran many passes into the first one", () => {
    expect(foldedTime(7.5, 2)).toBe(1.5);
    expect(foldedTime(1.25, 2)).toBe(1.25);
  });

  it("stands the bind pose at zero, which has no pass to fold into", () => {
    expect(foldedTime(312.4, 0)).toBe(0);
  });
});

describe("followClock", () => {
  it("replays to wherever the clock stands on its first frame", () => {
    const clock = createSceneClock();
    clock.advance(1.5);
    const driver = recorder();

    followClock(driver, clock, following());

    expect(driver.calls).toEqual(["seek 1.5"]);
  });

  it("steps by what the clock spent since, once it has caught up", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    followClock(driver, clock, followed);

    clock.advance(0.25);
    followClock(driver, clock, followed);

    expect(driver.calls).toEqual(["seek 0", "advance 0.25"]);
  });

  it("replays across a seek of the clock rather than stepping over it", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    followClock(driver, clock, followed);
    clock.advance(0.5);
    followClock(driver, clock, followed);

    clock.seek(2);
    followClock(driver, clock, followed);

    expect(driver.calls).toEqual(["seek 0", "advance 0.5", "seek 2"]);
    expect(driver.time).toBe(2);
  });

  it("holds still while the clock is paused", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    followClock(driver, clock, followed);

    followClock(driver, clock, followed);

    expect(driver.calls).toEqual(["seek 0", "advance 0"]);
  });
});

describe("followCue", () => {
  it("holds the driver at zero and unfired until the pass reaches the cue", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(0.5);

    expect(followCue(driver, clock, followed, 1, 4)).toBe(false);
    expect(driver.calls).toEqual([]);
  });

  it("replays to the run's own time past the cue on its first frame, then steps", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(1.5);

    expect(followCue(driver, clock, followed, 1, 4)).toBe(true);
    clock.advance(0.25);
    expect(followCue(driver, clock, followed, 1, 4)).toBe(true);

    expect(driver.calls).toEqual(["seek 0.5", "advance 0.25"]);
  });

  it("stands the driver down once when the pass starts over, and fires it again", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(3.75);
    followCue(driver, clock, followed, 1, 4);

    clock.advance(0.5);
    expect(followCue(driver, clock, followed, 1, 4)).toBe(false);
    clock.advance(0.5);
    expect(followCue(driver, clock, followed, 1, 4)).toBe(false);
    clock.advance(1);
    expect(followCue(driver, clock, followed, 1, 4)).toBe(true);

    expect(driver.calls).toEqual(["seek 2.75", "restart", "seek 0.75"]);
  });

  it("replays across a seek of the clock rather than stepping over it", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(2);
    followCue(driver, clock, followed, 1, 4);

    clock.seek(3);
    followCue(driver, clock, followed, 1, 4);

    expect(driver.calls).toEqual(["seek 1", "seek 2"]);
  });

  it("replays a cue at zero on every pass, since the pass wraps under it", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(3.5);
    followCue(driver, clock, followed, 0, 4);

    clock.advance(1);
    followCue(driver, clock, followed, 0, 4);

    expect(driver.calls).toEqual(["seek 3.5", "seek 0.5"]);
  });
});
