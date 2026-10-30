import { useCallback, useEffect, useRef, useState } from "react";

import type { ObjectProperties } from "@/lib/tauri";

import type { ChannelVoice, SoundChannel } from "../player/soundPlayer";
import { mediaUrl, useChannelState, useSoundChannel } from "../player/useSoundChannel";
import { useMixDraftStore } from "../state/mixDrafts";
import { usePreviewRepeat, usePreviewVolume } from "../state/previewTransport";
import type { EventVoice } from "../utils/eventTree";
import { voiceMix, withDrafts } from "../utils/voiceMix";
import type { WaveformSubject } from "../utils/waveformSync";

/** The player of the event tree. */
export interface EventPlayer {
  /** The key of the row that plays, or `null`. */
  readonly playing: string | null;
  /** The keys of the rows whose media failed to play. */
  readonly failed: ReadonlySet<string>;
  /** The key and the voices of the last play that had media, or `null` before one. */
  readonly played: WaveformSubject | null;
  /**
   * Plays `voices` for the row `key`, each with the mix of its path, and stops what played
   * before.
   */
  readonly play: (key: string, voices: readonly EventVoice[]) => void;
  readonly stop: () => void;
  /** Sets the properties that the mix of each voice reads, and moves the voices that play. */
  readonly mix: (properties: ReadonlyMap<number, ObjectProperties>) => void;
  /** The channel that plays the media, keyed by the row. */
  readonly channel: SoundChannel;
}

/**
 * Plays the picks of an event, a container or a sound on a channel of the shared player, each
 * with the properties along its path.
 *
 * A press stops what the press before it started. The row stops playing when every media ends,
 * or when it stops while Loop is on, and everything stops when the tree unmounts. The channel
 * plays at the preview volume.
 */
export function useEventPlayer(): EventPlayer {
  const channel = useSoundChannel(usePreviewVolume());
  const repeat = usePreviewRepeat();
  const state = useChannelState(channel);
  const [playing = null] = state.playing;
  const [played, setPlayed] = useState<WaveformSubject | null>(null);

  const stop = useCallback(() => channel.stopAll(), [channel]);
  const play = useCallback(
    (key: string, voices: readonly EventVoice[]) => {
      const sent = voices.map(channelVoice);
      channel.stopAll();
      channel.resume();
      channel.play(key, sent, repeat, 0);

      if (sent.length > 0) setPlayed({ key, voices: sent });
    },
    [channel, repeat],
  );
  const mix = useCallback(
    (properties: ReadonlyMap<number, ObjectProperties>) =>
      channel.setMixer((path) => voiceMix(path, properties)),
    [channel],
  );

  return { playing, failed: state.failed, played, play, stop, mix, channel };
}

/** Returns the voice that the channel plays for `voice`. */
function channelVoice(voice: EventVoice): ChannelVoice {
  return { url: mediaUrl(voice.media), path: voice.path };
}

/**
 * Keeps the mix of `player` on `properties` and the values of the knobs that turn.
 *
 * A knob step reaches the player without a render of the caller.
 */
export function usePlayerMix(
  player: EventPlayer,
  properties: ReadonlyMap<number, ObjectProperties>,
): void {
  const latest = useRef(properties);
  const { mix } = player;

  useEffect(() => {
    latest.current = properties;
    mix(withDrafts(properties, useMixDraftStore.getState().drafts));
  }, [mix, properties]);

  useEffect(
    () =>
      useMixDraftStore.subscribe((state, before) => {
        if (state.drafts !== before.drafts) mix(withDrafts(latest.current, state.drafts));
      }),
    [mix],
  );
}
