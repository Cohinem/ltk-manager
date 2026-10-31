import type { ChannelVoice, SoundChannel } from "./soundPlayer";

/** Stops every voice of `channel`, then plays `voices` under `key` as its only voices. */
export function playSolo(
  channel: SoundChannel,
  key: string,
  voices: readonly ChannelVoice[],
): void {
  channel.stopAll();
  channel.resume();
  channel.play(key, voices, "once", 0);
}

/** Stops `key` if it plays on `channel`, and else plays `voices` under it with `playSolo`. */
export function toggleSolo(
  channel: SoundChannel,
  key: string,
  voices: readonly ChannelVoice[],
): void {
  if (channel.state().playing.has(key)) {
    channel.stopAll();
    return;
  }

  playSolo(channel, key, voices);
}

/** Returns the voice of a media that plays as its file holds it, with no property applied. */
export function plainVoice(url: string): ChannelVoice {
  return { url, path: null };
}
