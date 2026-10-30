import type { SoundChannel } from "./soundPlayer";

/** Stops every voice of `channel`, then plays `urls` under `key` as its only voices. */
export function playSolo(channel: SoundChannel, key: string, urls: readonly string[]): void {
  channel.stopAll();
  channel.resume();
  channel.play(key, urls);
}

/** Stops `key` if it plays on `channel`, and else plays `urls` under it with `playSolo`. */
export function toggleSolo(channel: SoundChannel, key: string, urls: readonly string[]): void {
  if (channel.state().playing.has(key)) {
    channel.stopAll();
    return;
  }

  playSolo(channel, key, urls);
}
