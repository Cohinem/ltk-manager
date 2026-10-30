/**
 * The app's one Web Audio graph: an `AudioContext`, a master gain, and a gain per channel.
 *
 * A channel is the voices of one surface, a viewport or an audio file document, which play,
 * pause and stop together. Media arrive over the `sound` form of the `ltk-asset` scheme, decode
 * with `decodeAudioData` and stay in a cache by URL. The context is created on the first play or
 * decode, so a surface that never plays builds no graph. Per "Viewport sound" in docs/ux/AUDIO.md.
 */

/**
 * The most voices one channel plays at once. The oldest voice stops when a new one passes it.
 *
 * A dense skin fires a footstep and its echo per frame band on every loop, and 32 voices is the
 * default voice limit of the Wwise authoring tool, so the cap matches the voice count that the game mixes.
 */
export const VOICE_CAP = 32;

/** The decoded media the cache keeps. The first one decoded goes first. */
const BUFFER_CACHE_SIZE = 256;

/** How a voice plays its media: once to its end, or looped until its key stops. */
export type MediaRepeat = "once" | "loop";

/** What one channel plays, for a surface that draws it. */
export interface ChannelState {
  /** The keys that have a voice that plays or waits on its media. */
  readonly playing: ReadonlySet<string>;
  /** The keys whose media did not arrive or did not decode. */
  readonly failed: ReadonlySet<string>;
  /** `true` between `pause` and `resume`. */
  readonly paused: boolean;
}

/** The voices of one surface. */
export interface SoundChannel {
  /**
   * Starts one voice per URL under `key`, `from` seconds into each media.
   *
   * Each voice plays as `repeat` says, and waits `delays[i]` seconds before it starts. A voice
   * without a delay starts at once.
   */
  play(
    key: string,
    urls: readonly string[],
    repeat?: MediaRepeat,
    from?: number,
    delays?: readonly number[],
  ): void;
  /**
   * Moves every voice of `key` to `seconds` into its media, without its delay.
   *
   * A voice shorter than that ends.
   */
  seek(key: string, seconds: number): void;
  /** Returns the seconds into its media of the first voice of `key`, or `null` without one. */
  position(key: string): number | null;
  /** Stops every voice of `key`. */
  stop(key: string): void;
  /** Stops every voice of the channel. */
  stopAll(): void;
  /** Pauses every voice at its position. A voice that arrives while paused waits for `resume`. */
  pause(): void;
  /** Plays every paused voice on from the position where `pause` stopped it. */
  resume(): void;
  /** Sets the channel's gain, from 0 to 1. */
  setVolume(volume: number): void;
  state(): ChannelState;
  /** Calls `listener` after each change of `state`, until the returned function is called. */
  subscribe(listener: () => void): () => void;
}

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
}

let graph: Graph | null = null;

function audioGraph(): Graph {
  if (graph !== null) return graph;

  const context = new AudioContext();
  const master = context.createGain();
  master.connect(context.destination);
  graph = { context, master };
  return graph;
}

const buffers = new Map<string, Promise<AudioBuffer>>();

/** Returns the decoded media at `url`, from the cache that the channels play from. */
export function decodeMedia(url: string): Promise<AudioBuffer> {
  return decoded(audioGraph().context, url);
}

/**
 * Returns the decoded media at `url`, from the cache if the cache contains it, without adding it.
 *
 * The waveform column decodes every row it draws, which would evict what plays.
 */
export function decodeUncachedMedia(url: string, signal?: AbortSignal): Promise<AudioBuffer> {
  return buffers.get(url) ?? fetchDecoded(audioGraph().context, url, signal);
}

/** Returns the decoded media at `url`, from the cache or fetched once. */
function decoded(context: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = buffers.get(url);
  if (cached !== undefined) return cached;

  const loading = fetchDecoded(context, url);
  loading.catch(() => buffers.delete(url));

  buffers.set(url, loading);
  if (buffers.size > BUFFER_CACHE_SIZE) {
    const oldest = buffers.keys().next().value;
    if (oldest !== undefined) buffers.delete(oldest);
  }
  return loading;
}

/** Fetches the media at `url` and decodes it. */
async function fetchDecoded(
  context: AudioContext,
  url: string,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Failed to fetch the media at ${url}: status ${response.status}`);

  return context.decodeAudioData(await response.arrayBuffer());
}

interface Voice {
  readonly key: string;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  /** The context time the source started at. */
  startedAt: number;
  /** Seconds into the media the source started at, below zero while the voice waits on a delay. */
  offset: number;
  readonly repeat: MediaRepeat;
}

/** The timing of one voice, as `voiceTime` reads it. */
export interface VoiceTiming {
  /** Seconds into the media that the voice started or was paused at, below zero during a delay. */
  readonly offset: number;
  /** The context time the voice started at. */
  readonly startedAt: number;
  /** `true` while a source plays the voice. */
  readonly running: boolean;
  readonly repeat: MediaRepeat;
  /** The length of the media in seconds, or `null` before it decodes. */
  readonly duration: number | null;
}

/**
 * Returns the seconds into its media that a voice plays at the context time `now`.
 *
 * A looped voice wraps to the start of its media, and any other voice stops at its end.
 */
export function voiceTime(voice: VoiceTiming, now: number): number {
  const time = Math.max(0, voice.running ? voice.offset + (now - voice.startedAt) : voice.offset);
  if (voice.duration === null) return time;

  if (voice.repeat === "loop" && voice.duration > 0) return time % voice.duration;
  return Math.min(time, voice.duration);
}

const EMPTY: ChannelState = { playing: new Set(), failed: new Set(), paused: false };

/**
 * Returns a channel whose gain starts at `volume`.
 *
 * The channel touches no Web Audio object until its first `play`.
 */
export function openChannel(volume: number): SoundChannel {
  let gain: GainNode | null = null;
  let level = volume;
  let paused = false;
  let voices: Voice[] = [];
  let snapshot = EMPTY;
  let failed: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();

  const changed = () => {
    snapshot = { playing: new Set(voices.map((voice) => voice.key)), failed, paused };
    for (const listener of listeners) listener();
  };

  const output = (): GainNode => {
    if (gain !== null) return gain;
    const { context, master } = audioGraph();
    gain = context.createGain();
    gain.gain.value = level;
    gain.connect(master);
    return gain;
  };

  const halt = (voice: Voice) => {
    const source = voice.source;
    voice.source = null;
    if (source === null) return;

    source.onended = null;
    source.stop();
    source.disconnect();
  };

  const end = (voice: Voice) => {
    halt(voice);
    voices = voices.filter((each) => each !== voice);
  };

  const start = (voice: Voice) => {
    const { context } = audioGraph();
    if (voice.buffer === null) return;

    const looped = voice.repeat === "loop";
    const { duration } = voice.buffer;
    if (!looped && voice.offset >= duration) {
      end(voice);
      changed();
      return;
    }

    const source = context.createBufferSource();
    source.buffer = voice.buffer;
    source.loop = looped;
    if (looped && duration > 0 && voice.offset > 0) voice.offset %= duration;
    source.connect(output());
    source.onended = () => {
      end(voice);
      changed();
    };
    voice.source = source;
    voice.startedAt = context.currentTime;
    source.start(context.currentTime + Math.max(0, -voice.offset), Math.max(0, voice.offset));
  };

  return {
    play(key, urls, repeat = "once", from = 0, delays = []) {
      if (urls.length === 0) return;

      const { context } = audioGraph();
      output();
      void context.resume();

      for (const [at, url] of urls.entries()) {
        const offset = Math.max(0, from) - Math.max(0, delays[at] ?? 0);
        const voice: Voice = { key, buffer: null, source: null, startedAt: 0, offset, repeat };
        voices.push(voice);
        while (voices.length > VOICE_CAP) end(voices[0]);

        decoded(context, url).then(
          (buffer) => {
            if (!voices.includes(voice)) return;
            voice.buffer = buffer;
            if (!paused) start(voice);
          },
          (error: unknown) => {
            console.warn("A sound did not play:", error);
            end(voice);
            failed = new Set(failed).add(key);
            changed();
          },
        );
      }
      changed();
    },
    stop(key) {
      const stopped = voices.filter((voice) => voice.key === key);
      if (stopped.length === 0) return;

      for (const voice of stopped) end(voice);
      changed();
    },
    seek(key, seconds) {
      const moved = voices.filter((voice) => voice.key === key);
      if (moved.length === 0) return;

      for (const voice of moved) {
        halt(voice);
        voice.offset = Math.max(0, seconds);
        if (!paused) start(voice);
      }
      changed();
    },
    position(key) {
      const voice = voices.find((each) => each.key === key);
      if (voice === undefined) return null;

      const timing: VoiceTiming = {
        offset: voice.offset,
        startedAt: voice.startedAt,
        running: voice.source !== null,
        repeat: voice.repeat,
        duration: voice.buffer?.duration ?? null,
      };
      return voiceTime(timing, graph?.context.currentTime ?? 0);
    },
    stopAll() {
      if (voices.length === 0) return;

      for (const voice of voices) halt(voice);
      voices = [];
      changed();
    },
    pause() {
      if (paused) return;

      paused = true;
      for (const voice of voices) {
        if (graph === null || voice.source === null) continue;
        voice.offset += graph.context.currentTime - voice.startedAt;
        halt(voice);
      }
      changed();
    },
    resume() {
      if (!paused) return;

      paused = false;
      for (const voice of [...voices]) {
        if (voice.source === null && voice.buffer !== null) start(voice);
      }
      changed();
    },
    setVolume(next) {
      level = next;
      if (gain !== null) gain.gain.value = next;
    },
    state: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
