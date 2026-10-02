import { MusicNotesIcon } from "@phosphor-icons/react";
import { type SyntheticEvent, useEffect, useState } from "react";

import { EmptyState } from "@/components";
import { m } from "@/i18n";
import { usePreviewFileUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { DocumentFrame } from "../../shared/components/DocumentFrame";
import { PreviewStatus } from "./PreviewStatus";

interface MediaFacts {
  width: number;
  height: number;
  duration: number;
}

interface MediaPreviewProps {
  asset: AssetRef;
  /** The file name, which the document resolved. A reference may hold a hash. */
  name: string;
  /** Which element plays the file. */
  media: "video" | "audio";
}

/**
 * A video or an audio file, played by the webview's own `<video>` or `<audio>`.
 *
 * The bytes arrive over the `ltk-asset` protocol under the type their signature names, so
 * a chunk named by its hash plays as well as a named one. Nothing starts on its own.
 */
export function MediaPreview({ asset, name, media }: MediaPreviewProps) {
  const url = usePreviewFileUrl(asset);
  const [facts, setFacts] = useState<MediaFacts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFacts(null);
    setFailed(false);
  }, [url]);

  const onLoaded = (event: SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    const element = event.currentTarget;
    const video = element instanceof HTMLVideoElement ? element : null;
    setFacts({
      width: video?.videoWidth ?? 0,
      height: video?.videoHeight ?? 0,
      duration: element.duration,
    });
  };

  if (failed) {
    return (
      <EmptyState
        size="sm"
        className="h-full"
        title={m.workshop_preview_unreadable_title()}
        description={m.workshop_preview_media_unreadable_description({ name })}
      />
    );
  }

  return (
    <DocumentFrame data-ui="MediaPreview">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
        {media === "video" && (
          <video
            src={url}
            controls
            loop
            className="max-h-full max-w-full rounded-lg"
            onLoadedMetadata={onLoaded}
            onError={() => setFailed(true)}
          />
        )}
        {media === "audio" && (
          <>
            <MusicNotesIcon className="size-12 text-surface-500" />
            <audio
              src={url}
              controls
              className="w-full max-w-md"
              onLoadedMetadata={onLoaded}
              onError={() => setFailed(true)}
            />
          </>
        )}
      </div>

      <PreviewStatus facts={factsOf(facts)} />
    </DocumentFrame>
  );
}

function factsOf(facts: MediaFacts | null): string[] {
  if (!facts) return [];

  const out: string[] = [];
  if (facts.width > 0 && facts.height > 0) out.push(`${facts.width} × ${facts.height}`);
  if (Number.isFinite(facts.duration)) out.push(clock(facts.duration));
  return out;
}

/** `seconds` as `m:ss`, the way a player reads a length. */
function clock(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}
