import { describe, expect, it } from "vitest";

import type { MediaRow } from "@/lib/tauri";

import { formatDuration, nextSort, sortRows } from "../mediaRows";

function row(sourceId: number, durationSeconds: number | null): MediaRow {
  return {
    sourceId,
    sizeBytes: sourceId,
    format:
      durationSeconds === null
        ? null
        : {
            codec: 0xffff,
            channels: 1,
            sampleRate: 48000,
            averageBytesPerSecond: 1,
            dataSize: 1,
            durationSeconds,
          },
    playback: { kind: "playable" },
  };
}

describe("formatDuration", () => {
  it("writes minutes, seconds and centiseconds", () => {
    expect(formatDuration(2.41)).toBe("0:02.41");
    expect(formatDuration(61.875)).toBe("1:01.88");
  });

  it("carries rounded centiseconds into the next second", () => {
    expect(formatDuration(59.999)).toBe("1:00.00");
  });
});

describe("sortRows", () => {
  it("sorts rows without a duration last in either direction", () => {
    const rows = [row(1, null), row(2, 3), row(3, 1)];

    const longest = sortRows(rows, { key: "duration", descending: true });
    const shortest = sortRows(rows, { key: "duration", descending: false });

    expect(longest.map((each) => each.sourceId)).toEqual([2, 3, 1]);
    expect(shortest.map((each) => each.sourceId)).toEqual([3, 2, 1]);
  });
});

describe("nextSort", () => {
  it("cycles a size column from largest to smallest to the file order", () => {
    const first = nextSort(null, "size");
    const second = nextSort(first, "size");

    expect(first).toEqual({ key: "size", descending: true });
    expect(second).toEqual({ key: "size", descending: false });
    expect(nextSort(second, "size")).toBeNull();
  });
});
