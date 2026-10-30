import { describe, expect, it } from "vitest";

import { advancedOffset, endsIn, startOffset, voiceTime, type VoiceTiming } from "../voiceTiming";

const ONCE: VoiceTiming = {
  offset: 1,
  startedAt: 10,
  running: true,
  rate: 1,
  plays: 1,
  duration: 5,
};

describe("voiceTime", () => {
  it("adds the context time since the start to the offset of a running voice", () => {
    expect(voiceTime(ONCE, 11.5)).toBe(2.5);
  });

  it("returns the offset of a paused voice", () => {
    expect(voiceTime({ ...ONCE, offset: 1.25, running: false }, 30)).toBe(1.25);
  });

  it("returns the offset of a voice whose media has not decoded", () => {
    expect(voiceTime({ ...ONCE, offset: 0.5, running: false, duration: null }, 30)).toBe(0.5);
  });

  it("stops at the duration of the media", () => {
    expect(voiceTime({ ...ONCE, offset: 4 }, 12)).toBe(5);
  });

  it("returns the start of the media while a voice waits on its delay", () => {
    expect(voiceTime({ ...ONCE, offset: -0.5, plays: null }, 10.2)).toBe(0);
  });

  it("wraps a looped voice to the start of its media", () => {
    expect(voiceTime({ ...ONCE, offset: 4, plays: null }, 12)).toBe(1);
  });

  it("moves the playhead at the playback rate of a detuned voice", () => {
    expect(voiceTime({ ...ONCE, rate: 2 }, 11)).toBe(3);
    expect(voiceTime({ ...ONCE, rate: 0.5 }, 12)).toBe(2);
  });

  it("wraps a voice of several plays until its last play ends", () => {
    const thrice = { ...ONCE, offset: 0, plays: 3, duration: 2 };

    expect(voiceTime(thrice, 15)).toBe(1);
    expect(voiceTime(thrice, 17)).toBe(2);
  });
});

describe("advancedOffset", () => {
  it("advances the offset at the playback rate", () => {
    expect(advancedOffset(1, 2, 2)).toBe(5);
  });

  it("waits out a delay in context time before the rate applies", () => {
    expect(advancedOffset(-0.5, 0.2, 2)).toBeCloseTo(-0.3);
    expect(advancedOffset(-0.5, 1.5, 2)).toBe(2);
  });
});

describe("endsIn", () => {
  it("returns the context seconds until the last play of a voice ends", () => {
    expect(endsIn(1, 3, 2, 2)).toBe(2.5);
  });

  it("adds the delay that the voice still waits", () => {
    expect(endsIn(-0.5, 3, 2, 2)).toBe(3.5);
  });

  it("returns null for a voice that loops forever", () => {
    expect(endsIn(1, null, 2, 1)).toBeNull();
  });
});

describe("startOffset", () => {
  it("returns the seconds into the media that a source starts at", () => {
    expect(startOffset(-0.5, 2)).toBe(0);
    expect(startOffset(1.5, 2)).toBe(1.5);
    expect(startOffset(5, 2)).toBe(1);
  });
});
