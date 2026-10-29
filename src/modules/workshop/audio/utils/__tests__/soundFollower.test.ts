import { describe, expect, it } from "vitest";

import type { SoundCue } from "../soundCue";
import { createSoundFollower } from "../soundFollower";

/** A clock that a test moves by hand: `advance` steps it, `seek` jumps it. */
function fakeClock() {
  return {
    time: 0,
    generation: 0,
    advance(seconds: number) {
      this.time += seconds;
    },
    seek(to: number) {
      this.time = to;
      this.generation += 1;
    },
  };
}

/** An output that records each call as `play <key>` or `stop <key>`. */
function recorder() {
  const calls: string[] = [];
  return {
    calls,
    play: (cue: SoundCue) => calls.push(`play ${cue.key}`),
    stop: (key: string) => calls.push(`stop ${key}`),
  };
}

function cue(key: string, at: number, flags: Partial<SoundCue> = {}): SoundCue {
  return {
    key,
    name: `Play_${key}`,
    at,
    endAt: null,
    kill: false,
    loop: true,
    skipIfPastEnd: false,
    repeat: "once",
    ...flags,
  };
}

/** A follower over `cues` on a pass of four seconds, synced to a clock at zero. */
function following(cues: SoundCue[]) {
  const clock = fakeClock();
  const output = recorder();
  const follower = createSoundFollower(output, cues, 4);
  follower.follow(clock);
  return { clock, output, follower };
}

describe("createSoundFollower", () => {
  it("fires a cue once when forward playback crosses it", () => {
    const { clock, output, follower } = following([cue("step", 1)]);

    clock.advance(0.5);
    follower.follow(clock);
    clock.advance(0.75);
    follower.follow(clock);
    clock.advance(0.5);
    follower.follow(clock);

    expect(output.calls).toEqual(["play step"]);
  });

  it("fires a cue at zero on the first frame of the pass", () => {
    const { clock, output, follower } = following([cue("start", 0)]);

    clock.advance(0.1);
    follower.follow(clock);

    expect(output.calls).toEqual(["play start"]);
  });

  it("fires nothing on a scrub and stops the kill sounds that play", () => {
    const { clock, output, follower } = following([
      cue("swing", 1, { kill: true }),
      cue("echo", 1.5),
      cue("late", 3),
    ]);
    clock.advance(2);
    follower.follow(clock);

    clock.seek(3.5);
    follower.follow(clock);
    clock.seek(0.5);
    follower.follow(clock);

    expect(output.calls).toEqual(["play swing", "play echo", "stop swing"]);
  });

  it("fires nothing on a generation change that keeps the pass time", () => {
    const { clock, output, follower } = following([cue("swing", 1, { kill: true })]);
    clock.advance(0.5);
    follower.follow(clock);

    /* The viewport folds the clock into one pass when an effect model loads. */
    clock.seek(clock.time);
    follower.follow(clock);
    clock.advance(4);
    clock.seek(clock.time % 4);
    follower.follow(clock);

    expect(output.calls).toEqual([]);
  });

  it("fires the looping cues again on each pass and stops kill sounds when the pass wraps", () => {
    const { clock, output, follower } = following([cue("idle", 1, { kill: true }), cue("hum", 2)]);

    for (let frame = 0; frame < 10; frame += 1) {
      clock.advance(1);
      follower.follow(clock);
    }

    expect(output.calls).toEqual([
      "play idle",
      "play hum",
      "stop idle",
      "play idle",
      "play hum",
      "stop idle",
      "play idle",
    ]);
  });

  it("fires a one-time cue on the first pass alone, and again after a restart", () => {
    const { clock, output, follower } = following([cue("intro", 1, { loop: false })]);

    for (let frame = 0; frame < 10; frame += 1) {
      clock.advance(1);
      follower.follow(clock);
    }
    clock.seek(0);
    follower.follow(clock);
    clock.advance(1.5);
    follower.follow(clock);

    expect(output.calls).toEqual(["play intro", "play intro"]);
  });

  it("restarts a kill sound that fires while it still plays", () => {
    const { clock, output, follower } = following([
      cue("a", 1, { kill: true }),
      cue("a", 2, { kill: true }),
    ]);

    clock.advance(2.5);
    follower.follow(clock);

    expect(output.calls).toEqual(["play a", "stop a", "play a"]);
  });

  it("skips a cue whose crossing lands past its end frame", () => {
    const { clock, output, follower } = following([
      cue("skipped", 1, { skipIfPastEnd: true, endAt: 1.5 }),
      cue("kept", 1, { endAt: 1.5 }),
    ]);

    clock.advance(2);
    follower.follow(clock);

    expect(output.calls).toEqual(["play kept"]);
  });

  it("stops every kill sound when the cues change", () => {
    const { clock, output, follower } = following([
      cue("swing", 1, { kill: true }),
      cue("echo", 1),
    ]);
    clock.advance(1.5);
    follower.follow(clock);

    follower.setCues([cue("other", 3)], 4);
    clock.advance(1);
    follower.follow(clock);

    expect(output.calls).toEqual(["play swing", "play echo", "stop swing"]);
  });
});
