import type { ChannelState, SoundChannel } from "../soundPlayer";

/** Every URL a fake channel was asked to play, in order, across every channel. */
export const playedUrls: string[] = [];

/**
 * Returns a channel that plays nothing and records each URL in `playedUrls`.
 *
 * A key plays from `play` until `stop` or `stopAll`, as a voice that never ends does.
 */
export function openFakeChannel(): SoundChannel {
  let playing = new Set<string>();
  let snapshot: ChannelState = { playing, failed: new Set() };
  const listeners = new Set<() => void>();
  const changed = () => {
    snapshot = { playing, failed: snapshot.failed };
    for (const listener of listeners) listener();
  };

  return {
    play(key, urls) {
      playedUrls.push(...urls);
      playing = new Set(playing).add(key);
      changed();
    },
    stop(key) {
      if (!playing.has(key)) return;
      playing = new Set([...playing].filter((each) => each !== key));
      changed();
    },
    stopAll() {
      if (playing.size === 0) return;
      playing = new Set();
      changed();
    },
    pause() {},
    resume() {},
    setVolume() {},
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
