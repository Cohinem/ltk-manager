import { useEffect, useState, useSyncExternalStore } from "react";

import { assetVersion, currentAssetVersions, versionedUrl } from "@/lib/assetVersions";
import { previewSoundUrl } from "@/lib/previewUrl";
import type { MediaLocation } from "@/lib/tauri";

import { type ChannelState, openChannel, type SoundChannel } from "./soundPlayer";

/** The gain of the media table and the event tree, and the default of the viewport's volume. */
export const PREVIEW_VOLUME = 0.2;

/**
 * Returns a channel of the shared player for one surface, at `volume`.
 *
 * The channel keeps one identity for the life of the caller, follows `volume`, and stops every
 * voice when the caller unmounts.
 */
export function useSoundChannel(volume: number): SoundChannel {
  const [channel] = useState(() => openChannel(volume));

  useEffect(() => channel.setVolume(volume), [channel, volume]);
  useEffect(() => () => channel.stopAll(), [channel]);

  return channel;
}

/** Returns what `channel` plays, and re-renders the caller when it changes. */
export function useChannelState(channel: SoundChannel): ChannelState {
  return useSyncExternalStore(channel.subscribe, channel.state);
}

/** Returns the URL that the media at `location` decodes from, at its file's current version. */
export function mediaUrl(location: MediaLocation): string {
  const version = assetVersion(currentAssetVersions(), location.asset);
  return versionedUrl(previewSoundUrl(location.asset, location.source), version);
}
