import { describe, expect, it } from "vitest";

import { voiceTime } from "../soundPlayer";

describe("voiceTime", () => {
  it("adds the context time since the start to the offset of a running voice", () => {
    expect(
      voiceTime({ offset: 1, startedAt: 10, running: true, repeat: "once", duration: 5 }, 11.5),
    ).toBe(2.5);
  });

  it("returns the offset of a held voice", () => {
    expect(
      voiceTime({ offset: 1.25, startedAt: 10, running: false, repeat: "once", duration: 5 }, 30),
    ).toBe(1.25);
  });

  it("returns the offset of a voice whose media has not decoded", () => {
    expect(
      voiceTime({ offset: 0.5, startedAt: 0, running: false, repeat: "once", duration: null }, 30),
    ).toBe(0.5);
  });

  it("stops at the duration of the media", () => {
    expect(
      voiceTime({ offset: 4, startedAt: 10, running: true, repeat: "once", duration: 5 }, 12),
    ).toBe(5);
  });

  it("wraps a looped voice to the start of its media", () => {
    const voice = { offset: 4, startedAt: 10, running: true, repeat: "loop", duration: 5 } as const;

    expect(voiceTime(voice, 12)).toBe(1);
  });
});
