/**
 * The app's one Web Audio graph: an `AudioContext`, a master limiter, and the voices of each
 * channel.
 *
 * A channel is the voices of one surface, a viewport or an audio file document, which play,
 * pause and stop together. Media arrive over the `sound` form of the `ltk-asset` scheme, decode
 * with `decodeAudioData` and stay in a cache by URL. The context is created on the first play or
 * decode, so a surface that never plays builds no graph. Each voice plays through its own
 * high-pass and low-pass filter, while they are not 0, and its own gain. Per "Viewport sound" and
 * "Playback of properties" in docs/ux/AUDIO.md.
 */

import type { ObjectProperties } from "@/lib/tauri";

import { type MixPath, NEUTRAL_MIX, voiceMix, type VoiceMix } from "../utils/voiceMix";
import {
  hpfCutoff,
  loopPlays,
  lpfCutoff,
  type MediaRepeat,
  playbackRate,
  voiceLevel,
} from "./voiceParams";
import { advancedOffset, endsIn, startOffset, voiceTime } from "./voiceTiming";

export type { MediaRepeat } from "./voiceParams";

/**
 * The most voices one channel plays at once. The oldest voice stops when a new one passes it.
 *
 * A dense skin fires a footstep and its echo per frame band on every loop, and 32 voices is the
 * default voice limit of the Wwise authoring tool, so the cap matches the voice count that the game mixes.
 */
export const VOICE_CAP = 32;

/** The decoded media the cache keeps. The first one decoded goes first. */
const BUFFER_CACHE_SIZE = 256;

/** The time constant in seconds that a live change of a voice's parameters eases over. */
const RAMP = 0.02;

/**
 * The settings of the master limiter, which holds the sum of every voice under full scale.
 *
 * A ratio of 20 is the highest that `DynamicsCompressorNode` takes, and the 1 ms attack catches
 * the onset of a boosted voice.
 */
const LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const;

/** One media that a channel plays, and the objects that its mix is read from. */
export interface ChannelVoice {
  readonly url: string;
  /** The path in the play tree, or null for a media that plays as its file holds it. */
  readonly path: MixPath | null;
}

/** Reads the mix of the voice at a path. */
export type Mixer = (path: MixPath) => VoiceMix;

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
   * Starts one voice per entry of `voices` under `key`, `from` seconds into each media.
   *
   * Each voice plays with the mix that the channel's mixer reads for its path. It waits the
   * delay of its mix, unless it starts past 0, and loops as its loop count says. A voice that `repeat` loops plays until
   * its key stops.
   */
  play(key: string, voices: readonly ChannelVoice[], repeat?: MediaRepeat, from?: number): void;
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
  /** Sets the channel's volume, from 0 to 1, which every voice's gain scales. */
  setVolume(volume: number): void;
  /**
   * Sets the mixer that reads each voice's mix, and moves every voice to the mix it reads.
   *
   * A voice that plays eases its gain, its detune and its filters to the new mix. Its delay and
   * its loop count apply from its next play.
   */
  setMixer(mixer: Mixer): void;
  /** Returns `true` if a voice of the channel plays with the properties of `object`. */
  reaches(object: number): boolean;
  state(): ChannelState;
  /** Calls `listener` after each change of `state`, until the returned function is called. */
  subscribe(listener: () => void): () => void;
}

interface Graph {
  readonly context: AudioContext;
  /** The node that every voice connects to, before the limiter. */
  readonly input: AudioNode;
}

let graph: Graph | null = null;

function audioGraph(): Graph {
  if (graph !== null) return graph;

  const context = new AudioContext();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  limiter.connect(context.destination);
  graph = { context, input: limiter };
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

/** The nodes of a voice while a source plays it. */
interface VoiceNodes {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  hpf: BiquadFilterNode | null;
  lpf: BiquadFilterNode | null;
}

interface Voice {
  readonly key: string;
  readonly path: MixPath | null;
  mix: VoiceMix;
  /** The plays of the media, or null for a voice that loops until its key stops. */
  readonly plays: number | null;
  buffer: AudioBuffer | null;
  nodes: VoiceNodes | null;
  /** The context time the source started at, or the time of the last change of `rate`. */
  startedAt: number;
  /** Seconds into the media at `startedAt`, below zero while the voice waits on a delay. */
  offset: number;
  /** The speed of the media, from the detune of the mix. */
  rate: number;
}

/** The mixer of a channel before its surface sets one: no property, and the Play action delay. */
const PLAIN_MIXER: Mixer = (path) => voiceMix(path, new Map<number, ObjectProperties>());

const EMPTY: ChannelState = { playing: new Set(), failed: new Set(), paused: false };

/** Returns `true` if `a` and `b` move the nodes of a playing voice the same way. */
function sameLiveMix(a: VoiceMix, b: VoiceMix): boolean {
  return a.gain === b.gain && a.pitch === b.pitch && a.lpf === b.lpf && a.hpf === b.hpf;
}

/** Returns a biquad filter of `type` at `frequency`. */
function filterNode(
  context: AudioContext,
  type: BiquadFilterType,
  frequency: number,
): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  return filter;
}

/**
 * Connects the source of `nodes` through the filters that `mix` uses to the gain.
 *
 * A filter whose value is 0 is left out, and one that the mix keeps eases to its new cutoff.
 */
function wireFilters(context: AudioContext, nodes: VoiceNodes, mix: VoiceMix): void {
  const now = context.currentTime;
  const hpf = hpfCutoff(mix.hpf);
  const lpf = lpfCutoff(mix.lpf);
  const rewired =
    (hpf === null) !== (nodes.hpf === null) || (lpf === null) !== (nodes.lpf === null);

  if (!rewired) {
    if (hpf !== null) nodes.hpf?.frequency.setTargetAtTime(hpf, now, RAMP);
    if (lpf !== null) nodes.lpf?.frequency.setTargetAtTime(lpf, now, RAMP);
    return;
  }

  nodes.source.disconnect();
  nodes.hpf?.disconnect();
  nodes.lpf?.disconnect();
  nodes.hpf = hpf === null ? null : filterNode(context, "highpass", hpf);
  nodes.lpf = lpf === null ? null : filterNode(context, "lowpass", lpf);
  connectChain(nodes);
}

/** Connects the source of `nodes` through its filters to its gain. */
function connectChain(nodes: VoiceNodes): void {
  const chain = [nodes.source, nodes.hpf, nodes.lpf, nodes.gain].filter((node) => node !== null);
  for (const [at, node] of chain.entries()) {
    const next = chain[at + 1];
    if (next !== undefined) node.connect(next);
  }
}

/**
 * Returns a channel whose volume starts at `volume`.
 *
 * The channel touches no Web Audio object until its first `play`.
 */
export function openChannel(volume: number): SoundChannel {
  let level = volume;
  let mixer = PLAIN_MIXER;
  let paused = false;
  let voices: Voice[] = [];
  let snapshot = EMPTY;
  let failed: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();

  const changed = () => {
    snapshot = { playing: new Set(voices.map((voice) => voice.key)), failed, paused };
    for (const listener of listeners) listener();
  };

  const halt = (voice: Voice) => {
    const nodes = voice.nodes;
    voice.nodes = null;
    if (nodes === null) return;

    nodes.source.onended = null;
    nodes.source.stop();
    nodes.source.disconnect();
    nodes.hpf?.disconnect();
    nodes.lpf?.disconnect();
    nodes.gain.disconnect();
  };

  const end = (voice: Voice) => {
    halt(voice);
    voices = voices.filter((each) => each !== voice);
  };

  /** Schedules the end of the last play of a voice that plays its media several times. */
  const scheduleEnd = (voice: Voice, duration: number) => {
    const { context } = audioGraph();
    const ends = endsIn(voice.offset, voice.plays, duration, voice.rate);
    if (voice.nodes === null || voice.plays === null || voice.plays <= 1 || ends === null) return;

    voice.nodes.source.stop(context.currentTime + ends);
  };

  const start = (voice: Voice) => {
    const { context, input } = audioGraph();
    if (voice.buffer === null) return;

    const { duration } = voice.buffer;
    if (voice.plays !== null && voice.offset >= voice.plays * duration) {
      end(voice);
      changed();
      return;
    }
    if (voice.plays === null && duration > 0 && voice.offset > 0) voice.offset %= duration;

    const source = context.createBufferSource();
    source.buffer = voice.buffer;
    source.loop = voice.plays !== 1;
    source.detune.value = voice.mix.pitch;

    const gain = context.createGain();
    gain.gain.value = voiceLevel(level, voice.mix.gain);
    gain.connect(input);

    const hpf = hpfCutoff(voice.mix.hpf);
    const lpf = lpfCutoff(voice.mix.lpf);
    const nodes: VoiceNodes = {
      source,
      gain,
      hpf: hpf === null ? null : filterNode(context, "highpass", hpf),
      lpf: lpf === null ? null : filterNode(context, "lowpass", lpf),
    };
    connectChain(nodes);

    source.onended = () => {
      end(voice);
      changed();
    };
    voice.nodes = nodes;
    voice.rate = playbackRate(voice.mix.pitch);
    voice.startedAt = context.currentTime;
    source.start(
      context.currentTime + Math.max(0, -voice.offset),
      startOffset(voice.offset, duration),
    );
    scheduleEnd(voice, duration);
  };

  /** Moves `voice` to `mix`, easing the nodes of a voice that plays. */
  const remix = (voice: Voice, mix: VoiceMix) => {
    const before = voice.mix;
    voice.mix = mix;

    const { nodes } = voice;
    if (nodes === null || graph === null || sameLiveMix(before, mix)) return;

    const { context } = graph;
    const now = context.currentTime;
    if (mix.pitch !== before.pitch) {
      voice.offset = advancedOffset(voice.offset, now - voice.startedAt, voice.rate);
      voice.startedAt = now;
      voice.rate = playbackRate(mix.pitch);
      nodes.source.detune.setTargetAtTime(mix.pitch, now, RAMP);
      if (voice.buffer !== null) scheduleEnd(voice, voice.buffer.duration);
    }
    nodes.gain.gain.setTargetAtTime(voiceLevel(level, mix.gain), now, RAMP);
    wireFilters(context, nodes, mix);
  };

  return {
    play(key, played, repeat = "once", from = 0) {
      if (played.length === 0) return;

      const { context } = audioGraph();
      void context.resume();

      for (const { url, path } of played) {
        const mix = path === null ? NEUTRAL_MIX : mixer(path);
        const voice: Voice = {
          key,
          path,
          mix,
          plays: loopPlays(mix.loopCount, repeat),
          buffer: null,
          nodes: null,
          startedAt: 0,
          offset: from > 0 ? from : -mix.delay,
          rate: playbackRate(mix.pitch),
        };
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

      const timing = {
        offset: voice.offset,
        startedAt: voice.startedAt,
        running: voice.nodes !== null,
        rate: voice.rate,
        plays: voice.plays,
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
        if (graph === null || voice.nodes === null) continue;
        voice.offset = advancedOffset(
          voice.offset,
          graph.context.currentTime - voice.startedAt,
          voice.rate,
        );
        halt(voice);
      }
      changed();
    },
    resume() {
      if (!paused) return;

      paused = false;
      for (const voice of [...voices]) {
        if (voice.nodes === null && voice.buffer !== null) start(voice);
      }
      changed();
    },
    setVolume(next) {
      level = next;
      if (graph === null) return;

      const now = graph.context.currentTime;
      for (const voice of voices) {
        voice.nodes?.gain.gain.setTargetAtTime(voiceLevel(level, voice.mix.gain), now, RAMP);
      }
    },
    setMixer(next) {
      mixer = next;
      for (const voice of voices) {
        if (voice.path !== null) remix(voice, mixer(voice.path));
      }
    },
    reaches(object) {
      return voices.some(
        ({ path }) => path !== null && (path.nodes.includes(object) || path.action?.id === object),
      );
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
