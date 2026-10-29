import { queryOptions, skipToken } from "@tanstack/react-query";

import { decodeMedia } from "../player/soundPlayer";
import { WAVEFORM_BINS, waveformPeaks } from "../utils/waveformPeaks";
import { audioKeys } from "./queries";

/** The peaks and the length of one media, as the waveform view draws them. */
export interface Waveform {
  /** The peaks of the first two channels, `WAVEFORM_BINS` or fewer per channel. */
  readonly peaks: number[][];
  /** The length of the media in seconds. */
  readonly duration: number;
}

/** Decodes the media at `url` through the shared player's cache and reduces it to peaks. */
async function readWaveform(url: string): Promise<Waveform> {
  const buffer = await decodeMedia(url);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, at) =>
    buffer.getChannelData(at),
  );
  return { peaks: waveformPeaks(channels, WAVEFORM_BINS), duration: buffer.duration };
}

/* Keyed on the versioned URL, so a layer file changed on disk reads again. */
export const waveformQuery = (url: string | null) =>
  queryOptions<Waveform, Error>({
    queryKey: [...audioKeys.all, "waveform", url] as const,
    queryFn: url === null ? skipToken : () => readWaveform(url),
    staleTime: Infinity,
    retry: false,
  });
