import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { useAssetVersion, versionedUrl } from "@/lib/assetVersions";
import { previewSoundUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

/** The gain of every media the player plays, as an `HTMLMediaElement.volume` from 0 to 1. */
export const PREVIEW_VOLUME = 0.2;

/** The one player of an audio file document. */
export interface MediaPlayer {
  /** The ref that the document's `<audio>` element takes. */
  readonly element: RefObject<HTMLAudioElement | null>;
  /** The source ID that plays, or `null`. */
  readonly playing: number | null;
  /** The source IDs whose media failed to play. */
  readonly failed: ReadonlySet<number>;
  /** Plays `source`, or stops it if it plays. */
  readonly toggle: (source: number) => void;
  /** Clears `playing` when the element ends or fails. */
  readonly onEnded: () => void;
  readonly onError: () => void;
}

/**
 * Plays the media of `asset` through one `<audio>` element, one source at a time.
 *
 * Playing a source stops the one before it. The element stops when the file changes on disk
 * and when the document unmounts. Per "Media table" in docs/ux/AUDIO.md.
 */
export function useMediaPlayer(asset: AssetRef): MediaPlayer {
  const element = useRef<HTMLAudioElement>(null);
  const version = useAssetVersion(asset);
  const [playing, setPlaying] = useState<number | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    const audio = element.current;
    return () => {
      audio?.pause();
      setPlaying(null);
    };
  }, [version]);

  const fail = useCallback((source: number) => {
    setFailed((current) => new Set(current).add(source));
    setPlaying((current) => (current === source ? null : current));
  }, []);

  const toggle = useCallback(
    (source: number) => {
      const audio = element.current;
      if (audio === null) return;

      audio.pause();
      if (playing === source) {
        setPlaying(null);
        return;
      }

      audio.src = versionedUrl(previewSoundUrl(asset, source), version);
      audio.volume = PREVIEW_VOLUME;
      setPlaying(source);
      /* A pause or a new source rejects the pending play with an `AbortError`. */
      void audio.play().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) fail(source);
      });
    },
    [asset, fail, playing, version],
  );

  const onEnded = useCallback(() => setPlaying(null), []);
  const onError = useCallback(() => {
    if (playing !== null) fail(playing);
  }, [fail, playing]);

  return { element, playing, failed, toggle, onEnded, onError };
}
