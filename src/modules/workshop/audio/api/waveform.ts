import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import type { AssetRef, SandboxRef } from "@/lib/tauri";

import { createDecodeQueue } from "../player/decodeQueue";
import { decodeMedia, decodeUncachedMedia } from "../player/soundPlayer";
import { mediaUrl } from "../player/useSoundChannel";
import { firstEventMedia } from "../utils/thumbnailSource";
import { thumbnailBars, WAVEFORM_BINS, waveformPeaks } from "../utils/waveformPeaks";
import { audioKeys, audioQueries } from "./queries";

/** The peaks and the length of one media, as the waveform view draws them. */
export interface Waveform {
  /** The peaks of the first two channels, `WAVEFORM_BINS` or fewer per channel. */
  readonly peaks: number[][];
  /** The length of the media in seconds. */
  readonly duration: number;
}

/** The bars that the waveform column draws per row. */
const THUMBNAIL_BARS = 40;

/** The rows of the waveform column that decode at once. Each one decodes WEM on the backend. */
const THUMBNAIL_DECODES = 3;

const thumbnailDecodes = createDecodeQueue(THUMBNAIL_DECODES);

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, at) => buffer.getChannelData(at));
}

/** Decodes the media at `url` through the shared player's cache and reduces it to peaks. */
async function readWaveform(url: string): Promise<Waveform> {
  const buffer = await decodeMedia(url);
  return { peaks: waveformPeaks(channelsOf(buffer), WAVEFORM_BINS), duration: buffer.duration };
}

/** Decodes the media at `url` outside the shared player's cache and reduces it to bars. */
async function readBars(url: string, signal: AbortSignal): Promise<number[]> {
  const buffer = await decodeUncachedMedia(url, signal);
  return thumbnailBars(channelsOf(buffer), THUMBNAIL_BARS);
}

/* Keyed on the versioned URL, so a layer file changed on disk reads again. */
export const waveformQuery = (url: string | null) =>
  queryOptions<Waveform, Error>({
    queryKey: [...audioKeys.all, "waveform", url] as const,
    queryFn: url === null ? skipToken : () => readWaveform(url),
    staleTime: Infinity,
    retry: false,
  });

/* A row that scrolls out of view cancels its query, and a waiting decode never starts. */
export const thumbnailQuery = (url: string | null) =>
  queryOptions<number[], Error>({
    queryKey: [...audioKeys.all, "thumbnail", url] as const,
    queryFn:
      url === null
        ? skipToken
        : ({ signal }) => thumbnailDecodes.run(() => readBars(url, signal), signal),
    staleTime: Infinity,
    retry: false,
  });

/* Reads the event's tree in the decode slot, so the column also bounds the tree reads. */
export const eventThumbnailQuery = (
  queryClient: QueryClient,
  sandbox: SandboxRef,
  asset: AssetRef,
  version: number,
  event: number,
) =>
  queryOptions<number[] | null, Error>({
    queryKey: [...audioKeys.event(sandbox, asset, version, event), "thumbnail"] as const,
    queryFn: ({ signal }) =>
      thumbnailDecodes.run(async () => {
        const tree = await queryClient.fetchQuery(
          audioQueries.event(sandbox, asset, version, event),
        );
        const media = firstEventMedia(tree);
        return media === null ? null : readBars(mediaUrl(media), signal);
      }, signal),
    staleTime: Infinity,
    retry: false,
  });
