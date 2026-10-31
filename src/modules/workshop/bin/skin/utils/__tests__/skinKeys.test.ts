import { describe, expect, it } from "vitest";

import { SHIFT_FRAMES, SKIN_KEYS, skinKeyOf, type SkinKeyTarget } from "../skinKeys";

function target(time: number, speed = 1) {
  const calls: { seek?: number; playing?: boolean; speed?: number; fits: number } = { fits: 0 };
  const keys: SkinKeyTarget = {
    clock: {
      time,
      seek: (next) => {
        calls.seek = next;
      },
      restart: () => {
        calls.seek = 0;
      },
    },
    playing: true,
    setPlaying: (playing) => {
      calls.playing = playing;
    },
    speed,
    setSpeed: (next) => {
      calls.speed = next;
    },
    fit: () => {
      calls.fits += 1;
    },
  };

  return { keys, calls };
}

describe("SKIN_KEYS", () => {
  it("gives each key one hotkey and one shortcut", () => {
    const keys = Object.values(SKIN_KEYS);

    expect(new Set(keys.map((key) => key.hotkey)).size).toBe(keys.length);
    expect(new Set(keys.map((key) => key.shortcut)).size).toBe(keys.length);
  });

  it("resolves every hotkey that it lists", () => {
    for (const key of Object.values(SKIN_KEYS)) {
      expect(skinKeyOf(key.hotkey)).toBe(key);
    }
  });

  it("returns undefined for a hotkey that it does not list", () => {
    expect(skinKeyOf("x")).toBeUndefined();
  });

  it("pauses and moves one frame on an arrow", () => {
    const { keys, calls } = target(1);

    SKIN_KEYS.stepForward.run(keys);

    expect(calls.playing).toBe(false);
    expect(calls.seek).toBeCloseTo(1 + 1 / 60);
  });

  it("moves six frames on Shift and an arrow", () => {
    const { keys, calls } = target(1);

    SKIN_KEYS.stepBackLong.run(keys);

    expect(SHIFT_FRAMES).toBe(6);
    expect(calls.seek).toBeCloseTo(1 - 6 / 60);
  });

  it("walks the speed detents on the brackets", () => {
    const { keys, calls } = target(0, 1);

    SKIN_KEYS.faster.run(keys);
    expect(calls.speed).toBe(1.5);

    SKIN_KEYS.slower.run(keys);
    expect(calls.speed).toBe(0.5);
  });
});
