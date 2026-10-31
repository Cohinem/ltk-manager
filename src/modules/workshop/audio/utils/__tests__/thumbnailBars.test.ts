import { describe, expect, it } from "vitest";

import { thumbnailBars } from "../waveformPeaks";

describe("thumbnailBars", () => {
  it("scales the loudest bar to 1 and the rest by their magnitude", () => {
    const channel = Float32Array.from([0.125, -0.25, 0.5, -0.0625]);

    expect(thumbnailBars([channel], 2)).toEqual([0.5, 1]);
  });

  it("takes the louder of the first two channels in each bar", () => {
    const left = Float32Array.from([0.5, 0]);
    const right = Float32Array.from([0, -0.25]);
    const third = Float32Array.from([1, 1]);

    expect(thumbnailBars([left, right, third], 2)).toEqual([1, 0.5]);
  });

  it("returns flat bars for a silent media", () => {
    expect(thumbnailBars([new Float32Array(8)], 4)).toEqual([0, 0, 0, 0]);
  });

  it("returns no bars for a media without samples", () => {
    expect(thumbnailBars([new Float32Array(0)], 4)).toEqual([]);
  });
});
