import { describe, expect, it } from "vitest";

import { hpfCutoff, loopPlays, lpfCutoff, playbackRate, voiceLevel } from "../voiceParams";

describe("lpfCutoff", () => {
  it("returns null at 0, which bypasses the filter", () => {
    expect(lpfCutoff(0)).toBeNull();
  });

  it("falls from 20 kHz to 50 Hz over a log scale", () => {
    expect(lpfCutoff(100)).toBeCloseTo(50);
    expect(lpfCutoff(50)).toBeCloseTo(1000);
    expect(lpfCutoff(25)).toBeCloseTo(4472.1, 0);
  });
});

describe("hpfCutoff", () => {
  it("returns null at 0, which bypasses the filter", () => {
    expect(hpfCutoff(0)).toBeNull();
  });

  it("rises from 20 Hz to 8 kHz over a log scale", () => {
    expect(hpfCutoff(100)).toBeCloseTo(8000);
    expect(hpfCutoff(50)).toBeCloseTo(400);
  });
});

describe("playbackRate", () => {
  it("doubles the rate an octave up and halves it an octave down", () => {
    expect(playbackRate(0)).toBe(1);
    expect(playbackRate(1200)).toBeCloseTo(2);
    expect(playbackRate(-1200)).toBeCloseTo(0.5);
  });
});

describe("voiceLevel", () => {
  it("scales the channel volume by the gain in dB", () => {
    expect(voiceLevel(0.2, 0)).toBe(0.2);
    expect(voiceLevel(0.2, 6.0206)).toBeCloseTo(0.4);
    expect(voiceLevel(0.5, -20)).toBeCloseTo(0.05);
  });

  it("clamps the level to the full scale of the media", () => {
    expect(voiceLevel(0.2, 24)).toBe(1);
  });
});

describe("loopPlays", () => {
  it("plays a sound its loop count of times", () => {
    expect(loopPlays(1, "once")).toBe(1);
    expect(loopPlays(3, "once")).toBe(3);
  });

  it("loops forever at a loop count of 0", () => {
    expect(loopPlays(0, "once")).toBeNull();
  });

  it("loops a persistent sound forever whatever its loop count", () => {
    expect(loopPlays(3, "loop")).toBeNull();
    expect(loopPlays(1, "loop")).toBeNull();
  });
});
