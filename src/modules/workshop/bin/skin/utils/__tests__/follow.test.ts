import { describe, expect, it } from "vitest";

import { createSceneClock } from "@/modules/viewport";

import { emptySystem } from "../../../vfx/engine/model/systemModel";
import { createDriver, type RunEvent } from "../../../vfx/engine/simulation/driver";
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
    advance(seconds: number): readonly RunEvent[] {
      calls.push(`advance ${seconds}`);
      time += seconds;
      return [];
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

    expect(followCue(driver, clock, followed, 1, 4)).toBeNull();
    expect(driver.calls).toEqual([]);
  });

  it("replays to the run's own time past the cue on its first frame, then steps", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(1.5);

    expect(followCue(driver, clock, followed, 1, 4)).toEqual([]);
    clock.advance(0.25);
    expect(followCue(driver, clock, followed, 1, 4)).toEqual([]);

    expect(driver.calls).toEqual(["seek 0.5", "advance 0.25"]);
  });

  it("stands the driver down once when the pass starts over, and plays it forward again", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(3.75);
    followCue(driver, clock, followed, 1, 4);

    clock.advance(0.5);
    expect(followCue(driver, clock, followed, 1, 4)).toBeNull();
    clock.advance(0.5);
    expect(followCue(driver, clock, followed, 1, 4)).toBeNull();
    clock.advance(1);
    expect(followCue(driver, clock, followed, 1, 4)).toEqual([]);

    expect(driver.calls).toEqual(["seek 2.75", "restart", "advance 0.75"]);
  });

  it("returns the system start of a driver when forward play crosses the cue, and none on a seek", () => {
    const clock = createSceneClock();
    const driver = createDriver(1);
    driver.swap(emptySystem("0x1"));
    const followed = following();
    clock.advance(0.5);
    followCue(driver, clock, followed, 1, 4);

    clock.advance(0.52);
    expect(followCue(driver, clock, followed, 1, 4)).toEqual([{ kind: "systemStart" }]);

    clock.seek(1.5);
    expect(followCue(driver, clock, followed, 1, 4)).toEqual([]);
  });

  it("plays the cue forward after a seek of the clock to before it", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(2);
    followCue(driver, clock, followed, 1, 4);

    clock.seek(0.5);
    followCue(driver, clock, followed, 1, 4);
    clock.advance(0.75);
    followCue(driver, clock, followed, 1, 4);

    expect(driver.calls).toEqual(["seek 1", "restart", "advance 0.25"]);
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

  it("starts a cue at zero over on every pass, since the pass wraps under it", () => {
    const clock = createSceneClock();
    const driver = recorder();
    const followed = following();
    clock.advance(3.5);
    followCue(driver, clock, followed, 0, 4);

    clock.advance(1);
    followCue(driver, clock, followed, 0, 4);

    expect(driver.calls).toEqual(["seek 3.5", "restart", "advance 0.5"]);
  });
});
