import type { ChannelVoice, SoundChannel } from "../player/soundPlayer";

/** What the waveform view draws and plays: the voices of one key, of which it draws the first. */
export interface WaveformSubject {
  /** The channel key that the media plays under. */
  readonly key: string;
  /** The voices that one play starts, all at once. The view draws the media of the first one. */
  readonly voices: readonly ChannelVoice[];
}

/**
 * Returns the subject that the waveform view shows.
 *
 * Returns `played` while its key is `playing`. Otherwise returns `selected`, the media of the
 * selected row, and falls back to `played`.
 */
export function shownSubject(
  played: WaveformSubject | null,
  playing: string | null,
  selected: WaveformSubject | null,
): WaveformSubject | null {
  if (played !== null && played.key === playing) return played;
  return selected ?? played;
}

/** Whether the subject of a waveform plays, is paused, or does not play. */
export type PlaybackStatus = "playing" | "paused" | "stopped";

/** The link between a waveform view and the channel that plays its subject. */
export interface WaveformSync {
  status(): PlaybackStatus;
  /** Returns the playhead in seconds: the subject's position, or 0 if it does not play. */
  time(): number;
  /** Returns the playhead if it moved since the last frame, or `null` during a drag. */
  frame(): number | null;
  /** Moves the playhead to `seconds`, and plays the subject from there if it does not play. */
  seek(seconds: number): void;
  /** Seeks to `fraction` of the media, as a click on the view gives it. */
  seekFraction(fraction: number): void;
  /** Keeps the playhead of the view, which the drag moves, until `dragEnd`. */
  dragStart(): void;
  /** Ends a drag and seeks to `fraction` of the media. */
  dragEnd(fraction: number): void;
  /** Plays a stopped subject from the start, pauses a playing one and resumes a paused one. */
  toggle(): void;
}

/**
 * Returns the link between a view of `subject`, whose first media lasts `duration` seconds, and
 * `channel`.
 *
 * The channel stays the one player. The view reads the playhead from it and sends each seek and
 * press to it. Per "Waveform" in docs/ux/AUDIO.md.
 */
export function createWaveformSync(
  channel: SoundChannel,
  subject: WaveformSubject,
  duration: number,
): WaveformSync {
  const { key, voices } = subject;
  let dragging = false;
  let drawn: number | null = null;

  const clamp = (seconds: number) => Math.min(duration, Math.max(0, seconds));
  const plays = () => channel.state().playing.has(key);

  const playFrom = (seconds: number) => {
    channel.stopAll();
    channel.resume();
    channel.play(key, voices, "once", seconds);
  };

  const sync: WaveformSync = {
    status() {
      if (!plays()) return "stopped";
      return channel.state().paused ? "paused" : "playing";
    },
    time: () => clamp(channel.position(key) ?? 0),
    frame() {
      if (dragging) return null;

      const time = sync.time();
      if (time === drawn) return null;

      drawn = time;
      return time;
    },
    seek(seconds) {
      const time = clamp(seconds);
      if (plays()) {
        channel.seek(key, time);
      } else {
        playFrom(time);
      }
    },
    seekFraction: (fraction) => sync.seek(fraction * duration),
    dragStart() {
      dragging = true;
    },
    dragEnd(fraction) {
      dragging = false;
      sync.seekFraction(fraction);
    },
    toggle() {
      const status = sync.status();
      if (status === "playing") {
        channel.pause();
      } else if (status === "paused") {
        channel.resume();
      } else {
        playFrom(0);
      }
    },
  };

  return sync;
}

/** The share of the media that an arrow key steps the playhead. */
const ARROW_STEP = 1 / 20;

/** The share of the media that a page key steps the playhead. */
const PAGE_STEP = 1 / 4;

/**
 * Returns the playhead that `key` moves `time` to, within a media of `duration` seconds.
 *
 * Returns `null` for a key that does not seek.
 */
export function seekKeyTime(key: string, time: number, duration: number): number | null {
  const step = (share: number) => Math.min(duration, Math.max(0, time + share * duration));

  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return step(ARROW_STEP);
    case "ArrowLeft":
    case "ArrowDown":
      return step(-ARROW_STEP);
    case "PageUp":
      return step(PAGE_STEP);
    case "PageDown":
      return step(-PAGE_STEP);
    case "Home":
      return 0;
    case "End":
      return duration;
    default:
      return null;
  }
}
