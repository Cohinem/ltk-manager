import { useCallback } from "react";

import type { MediaLocation } from "@/lib/tauri";

import {
  mediaUrl,
  PREVIEW_VOLUME,
  useChannelState,
  useSoundChannel,
} from "../player/useSoundChannel";

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
 * Plays the picks of an event, a container or a sound on a channel of the shared player, every
 * media at once.
 *
 * A press stops what the press before it started. The row stops playing when every media ends,
 * and everything stops when the tree unmounts.
 */
export function useEventPlayer(): EventPlayer {
  const channel = useSoundChannel(PREVIEW_VOLUME);
  const state = useChannelState(channel);
  const [playing = null] = state.playing;

  const stop = useCallback(() => channel.stopAll(), [channel]);
  const play = useCallback(
    (key: string, sounds: readonly MediaLocation[]) => {
      channel.stopAll();
      channel.play(key, sounds.map(mediaUrl));
    },
    [channel],
  );

  return { playing, failed: state.failed, play, stop };
}
