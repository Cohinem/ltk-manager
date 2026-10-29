import type { ChannelState, SoundChannel } from "../soundPlayer";

/** Every URL a fake channel was asked to play, in order, across every channel. */
export const playedUrls: string[] = [];

/** Returns a decode that never settles, so a waveform under test stays on its loading line. */
export function decodeFakeMedia(): Promise<AudioBuffer> {
  return new Promise(() => {});
}

/**
 * Returns a channel that plays nothing and records each URL in `playedUrls`.
 *
 * A key plays from `play` until `stop` or `stopAll`, as a voice that never ends does. Its
 * position is the `from` of its `play` or the seconds of its last `seek`, and time does not
 * move it.
 */
export function openFakeChannel(): SoundChannel {
  let positions = new Map<string, number>();
  let paused = false;
  let snapshot: ChannelState = { playing: new Set(), failed: new Set(), paused };
  const listeners = new Set<() => void>();
  const changed = () => {
    snapshot = { playing: new Set(positions.keys()), failed: snapshot.failed, paused };
    for (const listener of listeners) listener();
  };

  return {
    play(key, urls, from = 0) {
      playedUrls.push(...urls);
      positions = new Map(positions).set(key, from);
      changed();
    },
    seek(key, seconds) {
      if (!positions.has(key)) return;
      positions = new Map(positions).set(key, seconds);
      changed();
    },
    position: (key) => positions.get(key) ?? null,
    stop(key) {
      if (!positions.has(key)) return;
      positions = new Map([...positions].filter(([each]) => each !== key));
      changed();
    },
    stopAll() {
      if (positions.size === 0) return;
      positions = new Map();
      changed();
    },
    pause() {
      paused = true;
      changed();
    },
    resume() {
      paused = false;
      changed();
    },
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
