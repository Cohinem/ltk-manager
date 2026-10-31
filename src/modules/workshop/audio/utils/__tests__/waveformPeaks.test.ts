import { describe, expect, it } from "vitest";

import { waveformPeaks } from "../waveformPeaks";

describe("waveformPeaks", () => {
  it("keeps the sample of the largest magnitude in each bin, with its sign", () => {
    const channel = Float32Array.from([0.125, -0.5, 0.25, 0.375, -0.125, 0.25]);

    expect(waveformPeaks([channel], 3)).toEqual([[-0.5, 0.375, 0.25]]);
  });

  it("returns one value per sample if the media is shorter than the bins", () => {
    const channel = Float32Array.from([0.5, -0.25]);

    expect(waveformPeaks([channel], 2000)).toEqual([[0.5, -0.25]]);
  });

  it("reads the first two channels of a media with more", () => {
    const channels = [[0.5], [-0.5], [1]].map((samples) => Float32Array.from(samples));

    expect(waveformPeaks(channels, 4)).toEqual([[0.5], [-0.5]]);
  });

  it("spreads an uneven sample count over every bin", () => {
    const channel = Float32Array.from([1, 0, 0, 0, 0, 0, 0, -1]);

    const [peaks] = waveformPeaks([channel], 3);

    expect(peaks).toHaveLength(3);
    expect(peaks[0]).toBe(1);
    expect(peaks[2]).toBe(-1);
  });

  it("returns an empty channel for a media without samples", () => {
    expect(waveformPeaks([new Float32Array(0)], 100)).toEqual([[]]);
  });
});
