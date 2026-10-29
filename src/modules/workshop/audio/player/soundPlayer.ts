/**
 * The app's one Web Audio graph: an `AudioContext`, a master gain, and a gain per channel.
 *
 * A channel is the voices of one surface, a viewport or an audio file document, which play,
 * pause and stop together. Media arrive over the `sound` form of the `ltk-asset` scheme, decode
 * with `decodeAudioData` and stay in a cache by URL. The context is created on the first play,
 * so a surface that never plays builds no graph. Per "Viewport sound" in docs/ux/AUDIO.md.
 */

/**
 * The most voices one channel plays at once. The oldest voice stops when a new one passes it.
 *
 * A dense skin fires a footstep and its echo per frame band on every loop, and 32 voices is the
 * default voice limit of the Wwise authoring tool, so the cap holds what the game would mix.
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
}

/** The voices of one surface. */
export interface SoundChannel {
  /** Starts one voice per URL under `key`, all at once, each played as `repeat` says. */
  play(key: string, urls: readonly string[], repeat?: MediaRepeat): void;
  /** Stops every voice of `key`. */
  stop(key: string): void;
  /** Stops every voice of the channel. */
  stopAll(): void;
  /** Holds every voice where it is. A voice that arrives while paused waits for `resume`. */
  pause(): void;
  /** Plays every held voice on from where `pause` held it. */
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

/** Returns the decoded media at `url`, from the cache or fetched once. */
function decoded(context: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = buffers.get(url);
  if (cached !== undefined) return cached;

  const loading = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`The media at ${url} answered ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes));
  loading.catch(() => buffers.delete(url));

  buffers.set(url, loading);
  if (buffers.size > BUFFER_CACHE_SIZE) {
    const oldest = buffers.keys().next().value;
    if (oldest !== undefined) buffers.delete(oldest);
  }
  return loading;
}

interface Voice {
  readonly key: string;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  /** The context time the source started at. */
  startedAt: number;
  /** Seconds into the media the source started at. */
  offset: number;
  readonly repeat: MediaRepeat;
}

const EMPTY: ChannelState = { playing: new Set(), failed: new Set() };

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
    snapshot = { playing: new Set(voices.map((voice) => voice.key)), failed };
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
    if (looped && duration > 0) voice.offset %= duration;
    source.connect(output());
    source.onended = () => {
      end(voice);
      changed();
    };
    voice.source = source;
    voice.startedAt = context.currentTime;
    source.start(0, voice.offset);
  };

  return {
    play(key, urls, repeat = "once") {
      if (urls.length === 0) return;

      const { context } = audioGraph();
      output();
      void context.resume();

      for (const url of urls) {
        const voice: Voice = { key, buffer: null, source: null, startedAt: 0, offset: 0, repeat };
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
    stopAll() {
      if (voices.length === 0) return;

      for (const voice of voices) halt(voice);
      voices = [];
      changed();
    },
    pause() {
      if (paused) return;

      paused = true;
      if (graph === null) return;
      for (const voice of voices) {
        if (voice.source === null) continue;
        voice.offset += graph.context.currentTime - voice.startedAt;
        halt(voice);
      }
    },
    resume() {
      if (!paused) return;

      paused = false;
      for (const voice of [...voices]) {
        if (voice.source === null && voice.buffer !== null) start(voice);
      }
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
