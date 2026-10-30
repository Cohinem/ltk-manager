/**
 * The time math of a voice: where its playhead is, and when it ends.
 *
 * An offset is the seconds into the media, summed over every play. A negative offset is a delay
 * that the voice still waits, which passes in context time. A detuned voice plays at `rate`, so
 * one second of context time moves its media `rate` seconds.
 */

/** The timing of one voice, as `voiceTime` reads it. */
export interface VoiceTiming {
  /** Seconds into the media that the voice started or was paused at, below zero during a delay. */
  readonly offset: number;
  /** The context time the voice started at. */
  readonly startedAt: number;
  /** `true` while a source plays the voice. */
  readonly running: boolean;
  /** The speed of the media, from the voice's detune. */
  readonly rate: number;
  /** The number of plays of the media, or null for a voice that loops until it stops. */
  readonly plays: number | null;
  /** The length of the media in seconds, or `null` before it decodes. */
  readonly duration: number | null;
}

/** Returns the offset of a voice at `offset` after `elapsed` seconds of context time at `rate`. */
export function advancedOffset(offset: number, elapsed: number, rate: number): number {
  if (offset >= 0) return offset + elapsed * rate;

  const wait = -offset;
  if (elapsed <= wait) return offset + elapsed;

  return (elapsed - wait) * rate;
}

/**
 * Returns the seconds into its media that a voice plays at the context time `now`.
 *
 * A voice wraps to the start of its media until its last play ends, and then stays at the end.
 * A voice that waits on its delay is at the start.
 */
export function voiceTime(voice: VoiceTiming, now: number): number {
  const advanced = voice.running
    ? advancedOffset(voice.offset, now - voice.startedAt, voice.rate)
    : voice.offset;
  const time = Math.max(0, advanced);
  const { duration, plays } = voice;
  if (duration === null || duration <= 0) return time;

  if (plays !== null && time >= plays * duration) return duration;
  return time % duration;
}

/**
 * Returns the context seconds until a voice at `offset` ends its last play of a `duration` media.
 *
 * The delay that the voice still waits is added. Returns null for a voice that loops until it
 * stops.
 */
export function endsIn(
  offset: number,
  plays: number | null,
  duration: number,
  rate: number,
): number | null {
  if (plays === null) return null;

  const wait = Math.max(0, -offset);
  return wait + (plays * duration - Math.max(0, offset)) / rate;
}

/** Returns the seconds into a `duration` media that a source starts at, for a voice at `offset`. */
export function startOffset(offset: number, duration: number): number {
  if (offset <= 0 || duration <= 0) return 0;

  return offset % duration;
}
