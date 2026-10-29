/** The bins the waveform view draws a media from, per channel. */
export const WAVEFORM_BINS = 2000;

/** The channels the waveform view draws. A stereo media draws left above right. */
const DRAWN_CHANNELS = 2;

/**
 * Reduces the samples of the first two channels to at most `bins` values each.
 *
 * Each value is the sample of the largest magnitude in its bin, with its sign. A media with
 * fewer samples than `bins` keeps one value per sample.
 */
export function waveformPeaks(channels: readonly ArrayLike<number>[], bins: number): number[][] {
  return channels.slice(0, DRAWN_CHANNELS).map((samples) => channelPeaks(samples, bins));
}

/**
 * Reduces a media to at most `count` bar heights from 0 to 1, for the waveform column.
 *
 * A bar is the largest magnitude of the first two channels in its bin. The loudest bar is 1, so
 * a quiet media still draws. A silent media draws flat bars.
 */
export function thumbnailBars(channels: readonly ArrayLike<number>[], count: number): number[] {
  const [first, ...rest] = waveformPeaks(channels, count);
  if (first === undefined) return [];

  const bars = first.map((peak, at) =>
    Math.max(Math.abs(peak), ...rest.map((other) => Math.abs(other[at] ?? 0))),
  );
  const loudest = Math.max(0, ...bars);
  return loudest === 0 ? bars : bars.map((bar) => bar / loudest);
}

function channelPeaks(samples: ArrayLike<number>, bins: number): number[] {
  const count = Math.min(bins, samples.length);
  const width = samples.length / count;
  const peaks: number[] = [];

  for (let bin = 0; bin < count; bin++) {
    const end = Math.min(samples.length, Math.ceil((bin + 1) * width));
    let peak = 0;
    for (let at = Math.floor(bin * width); at < end; at++) {
      if (Math.abs(samples[at]) > Math.abs(peak)) peak = samples[at];
    }
    peaks.push(peak);
  }

  return peaks;
}
