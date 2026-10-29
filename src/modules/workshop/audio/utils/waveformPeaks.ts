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
