import { useCallback, useState } from "react";

import type { MediaLocation } from "@/lib/tauri";

import type { SoundChannel } from "../player/soundPlayer";
import {
  mediaUrl,
  PREVIEW_VOLUME,
  useChannelState,
  useSoundChannel,
} from "../player/useSoundChannel";
import type { WaveformSubject } from "../utils/waveformSync";

/** The player of the event tree. */
export interface EventPlayer {
  /** The key of the row that plays, or `null`. */
  readonly playing: string | null;
  /** The keys of the rows whose media failed to play. */
  readonly failed: ReadonlySet<string>;
  /** The key and the media of the last play that had media, or `null` before one. */
  readonly played: WaveformSubject | null;
  /** Plays `sounds` at once for the row `key`, and stops what played before. */
  readonly play: (key: string, sounds: readonly MediaLocation[]) => void;
  readonly stop: () => void;
  /** The channel that plays the media, keyed by the row. */
  readonly channel: SoundChannel;
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
  const [played, setPlayed] = useState<WaveformSubject | null>(null);

  const stop = useCallback(() => channel.stopAll(), [channel]);
  const play = useCallback(
    (key: string, sounds: readonly MediaLocation[]) => {
      const urls = sounds.map(mediaUrl);
      channel.stopAll();
      channel.resume();
      channel.play(key, urls);

      if (urls.length > 0) setPlayed({ key, urls });
    },
    [channel],
  );

  return { playing, failed: state.failed, played, play, stop, channel };
}
