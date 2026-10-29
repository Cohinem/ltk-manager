import { useCallback, useEffect, useMemo } from "react";

import { useAssetVersion, versionedUrl } from "@/lib/assetVersions";
import { previewSoundUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { PREVIEW_VOLUME, useChannelState, useSoundChannel } from "../player/useSoundChannel";

/** The one player of an audio file document. */
export interface MediaPlayer {
  /** The source ID that plays, or `null`. */
  readonly playing: number | null;
  /** The source IDs whose media failed to play. */
  readonly failed: ReadonlySet<number>;
  /** Plays `source`, or stops it if it plays. */
  readonly toggle: (source: number) => void;
}

/**
 * Plays the media of `asset` on a channel of the shared player, one source at a time.
 *
 * Playing a source stops the one before it. The channel stops when the file changes on disk and
 * when the document unmounts. Per "Media table" in docs/ux/AUDIO.md.
 */
export function useMediaPlayer(asset: AssetRef): MediaPlayer {
  const version = useAssetVersion(asset);
  const channel = useSoundChannel(PREVIEW_VOLUME);
  const state = useChannelState(channel);

  useEffect(() => () => channel.stopAll(), [channel, version]);

  const playing = useMemo(() => {
    const [key] = state.playing;
    return key === undefined ? null : Number(key);
  }, [state.playing]);
  const failed = useMemo(() => new Set([...state.failed].map(Number)), [state.failed]);

  const toggle = useCallback(
    (source: number) => {
      const key = String(source);
      const was = channel.state().playing.has(key);
      channel.stopAll();
      if (was) return;

      channel.play(key, [versionedUrl(previewSoundUrl(asset, source), version)]);
    },
    [asset, channel, version],
  );

  return { playing, failed, toggle };
}
