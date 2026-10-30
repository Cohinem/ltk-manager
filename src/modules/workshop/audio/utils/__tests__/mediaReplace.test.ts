import { describe, expect, it } from "vitest";

import type { MediaFormat, MediaReplacement, ReplacedSound } from "@/lib/tauri";

import { asksBeforeReplace, formatChanges } from "../mediaReplace";

const VORBIS: MediaFormat = {
  codec: 0xffff,
  channels: 1,
  sampleRate: 48_000,
  averageBytesPerSecond: 8_000,
  dataSize: 16_000,
  durationSeconds: 2,
};

function sound(id: number, opened = true): ReplacedSound {
  return { id, stream: "dataBank", opened, size: 100, newSize: 200 };
}

function replacement(
  after: Partial<MediaFormat> = {},
  sounds: ReplacedSound[] = [sound(1)],
): MediaReplacement {
  const row = (format: MediaFormat) => ({
    sourceId: 7,
    sizeBytes: 100,
    format,
    playback: { kind: "playable" } as const,
  });
  return {
    path: "a_audio.bnk",
    before: row(VORBIS),
    after: row({ ...VORBIS, ...after }),
    sounds,
  };
}

describe("formatChanges", () => {
  it("lists the channel count and the rate that differ", () => {
    expect(formatChanges(replacement({ channels: 2, sampleRate: 44_100 }))).toEqual([
      "channels",
      "rate",
    ]);
  });

  it("returns nothing if the media keeps its format", () => {
    expect(formatChanges(replacement({ dataSize: 1 }))).toEqual([]);
  });
});

describe("asksBeforeReplace", () => {
  it("returns false for one sound of the bank and the same format", () => {
    expect(asksBeforeReplace(replacement())).toBe(false);
  });

  it("returns true if several sounds share the media", () => {
    expect(asksBeforeReplace(replacement({}, [sound(1), sound(2)]))).toBe(true);
  });

  it("returns true if a sound of another bank plays the media", () => {
    expect(asksBeforeReplace(replacement({}, [sound(1, false)]))).toBe(true);
  });

  it("returns true if the rate changes", () => {
    expect(asksBeforeReplace(replacement({ sampleRate: 22_050 }))).toBe(true);
  });
});
