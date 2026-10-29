import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { AssetRef } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useSandbox } from "../../sandbox/state/SandboxContext";
import { eventThumbnailQuery, thumbnailQuery } from "../api/waveform";
import { mediaUrl } from "../player/useSoundChannel";
import type { EventRow } from "../utils/eventTree";
import { thumbnailSource } from "../utils/thumbnailSource";

/** The bar height that a silent bin draws, so a quiet stretch still reads as a line. */
const MIN_BAR = 0.08;

interface MediaThumbnailProps {
  /** The URL of the media, or `null` for a row that does not play. */
  readonly url: string | null;
  readonly playing: boolean;
}

/**
 * The waveform column of one media row, decoded when the row scrolls into view.
 *
 * Per "Waveform column" in docs/ux/AUDIO.md.
 */
export function MediaThumbnail({ url, playing }: MediaThumbnailProps) {
  const bars = useQuery(thumbnailQuery(url));
  return <ThumbnailBars bars={bars.data ?? null} playing={playing} />;
}

interface EventRowThumbnailProps {
  readonly asset: AssetRef;
  readonly version: number;
  readonly row: EventRow;
  readonly playing: boolean;
}

/** The waveform column of one event tree row: the first media that a press on it plays. */
export function EventRowThumbnail({ asset, version, row, playing }: EventRowThumbnailProps) {
  const source = thumbnailSource(row);

  if (source === null) return <ThumbnailBars bars={null} playing={false} />;
  if (source.kind === "media") {
    return <MediaThumbnail url={mediaUrl(source.media)} playing={playing} />;
  }
  return <EventThumbnail asset={asset} version={version} event={source.id} playing={playing} />;
}

interface EventThumbnailProps {
  readonly asset: AssetRef;
  readonly version: number;
  readonly event: number;
  readonly playing: boolean;
}

function EventThumbnail({ asset, version, event, playing }: EventThumbnailProps) {
  const sandbox = useSandbox();
  const queryClient = useQueryClient();
  const bars = useQuery(eventThumbnailQuery(queryClient, sandbox, asset, version, event));
  return <ThumbnailBars bars={bars.data ?? null} playing={playing} />;
}

/** The bars of a thumbnail, or an empty box of the same size while they read. */
function ThumbnailBars({ bars, playing }: { bars: readonly number[] | null; playing: boolean }) {
  if (bars === null || bars.length === 0)
    return <span aria-hidden="true" className="block h-3.5" />;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${bars.length * 3} 2`}
      preserveAspectRatio="none"
      className={twMerge("block h-3.5 w-full", playing ? "text-accent-400" : "text-surface-500")}
    >
      {bars.map((bar, at) => {
        const height = Math.max(MIN_BAR, bar) * 2;
        return (
          <rect
            key={at}
            x={at * 3}
            y={1 - height / 2}
            width={2}
            height={height}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
