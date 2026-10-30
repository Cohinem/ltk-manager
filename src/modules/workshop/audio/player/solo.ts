import type { SoundChannel } from "./soundPlayer";

/**
 * Stops every voice of `channel`, then plays `urls` under `key` as its only voices.
 *
 * Each voice waits `delays[i]` seconds before it starts.
 */
export function playSolo(
  channel: SoundChannel,
  key: string,
  urls: readonly string[],
  delays?: readonly number[],
): void {
  channel.stopAll();
  channel.resume();
  channel.play(key, urls, "once", 0, delays);
}

/** Stops `key` if it plays on `channel`, and else plays `urls` under it with `playSolo`. */
export function toggleSolo(channel: SoundChannel, key: string, urls: readonly string[]): void {
  if (channel.state().playing.has(key)) {
    channel.stopAll();
    return;
  }

  playSolo(channel, key, urls);
}
