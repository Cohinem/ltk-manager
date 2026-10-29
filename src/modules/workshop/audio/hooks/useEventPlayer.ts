import { useCallback, useEffect, useRef, useState } from "react";

import { previewSoundUrl } from "@/lib/previewUrl";
import type { MediaLocation } from "@/lib/tauri";

import { PREVIEW_VOLUME } from "./useMediaPlayer";

/** The player of the event tree. */
export interface EventPlayer {
  /** The key of the row that plays, or `null`. */
  readonly playing: string | null;
  /** The keys of the rows whose media failed to play. */
  readonly failed: ReadonlySet<string>;
  /** Plays `sounds` at once for the row `key`, and stops what played before. */
  readonly play: (key: string, sounds: readonly MediaLocation[]) => void;
  readonly stop: () => void;
}

/**
 * Plays the picks of an event, a container or a sound, each media through an `<audio>` of its
 * own, all at once.
 *
 * A press stops what the press before it started. The row stops playing when every media ends,
 * and everything stops when the tree unmounts. #953 replaces the elements with the shared Web
 * Audio player.
 */
export function useEventPlayer(): EventPlayer {
  const elements = useRef<HTMLAudioElement[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  const stop = useCallback(() => {
    for (const element of elements.current) element.pause();
    elements.current = [];
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (key: string, sounds: readonly MediaLocation[]) => {
      stop();
      if (sounds.length === 0) return;

      const started = sounds.map((sound) => {
        const element = new Audio(previewSoundUrl(sound.asset, sound.source));
        element.volume = PREVIEW_VOLUME;
        return element;
      });
      elements.current = started;
      setPlaying(key);

      let left = started.length;
      const settle = () => {
        left -= 1;
        if (left === 0 && elements.current === started) setPlaying(null);
      };
      for (const element of started) {
        element.addEventListener("ended", settle, { once: true });
        /* A pause or a new press rejects the pending play with an `AbortError`. */
        void element.play().catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setFailed((current) => new Set(current).add(key));
          settle();
        });
      }
    },
    [stop],
  );

  return { playing, failed, play, stop };
}
