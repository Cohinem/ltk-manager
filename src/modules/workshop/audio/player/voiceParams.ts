/**
 * Maps the summed properties of a voice onto the parameters of its Web Audio nodes.
 *
 * Per "Playback of properties" in docs/ux/AUDIO.md.
 */

/** How a voice plays its media: once to its end, or looped until its key stops. */
export type MediaRepeat = "once" | "loop";

/** The cutoff of the low-pass filter at `LPF` 0, in Hz, the top of the audible band. */
const LPF_TOP = 20_000;

/** The cutoff of the low-pass filter at `LPF` 100, in Hz. */
const LPF_BOTTOM = 50;

/** The cutoff of the high-pass filter at `HPF` 0, in Hz, the bottom of the audible band. */
const HPF_BOTTOM = 20;

/** The cutoff of the high-pass filter at `HPF` 100, in Hz, as many octaves up as LPF goes down. */
const HPF_TOP = 8_000;

/** The highest value of `LPF` and `HPF`. */
const FILTER_MAX = 100;

/** The highest level of a voice: its media at full scale. */
const MAX_LEVEL = 1;

const CENTS_PER_OCTAVE = 1200;

/**
 * Returns the cutoff in Hz of the low-pass filter for an `LPF` of `value`.
 *
 * Returns null at 0, where the filter is bypassed. Wwise does not publish its curve, so the
 * cutoff falls on a log scale from 20 kHz to 50 Hz at 100, an approximation.
 */
export function lpfCutoff(value: number): number | null {
  if (value <= 0) return null;

  return LPF_TOP * (LPF_BOTTOM / LPF_TOP) ** (Math.min(value, FILTER_MAX) / FILTER_MAX);
}

/**
 * Returns the cutoff in Hz of the high-pass filter for an `HPF` of `value`.
 *
 * Returns null at 0, where the filter is bypassed. The cutoff rises on a log scale from 20 Hz to
 * 8 kHz at 100, an approximation as `lpfCutoff` is.
 */
export function hpfCutoff(value: number): number | null {
  if (value <= 0) return null;

  return HPF_BOTTOM * (HPF_TOP / HPF_BOTTOM) ** (Math.min(value, FILTER_MAX) / FILTER_MAX);
}

/** Returns the speed that a detune of `cents` plays a media at, 1 for its own speed. */
export function playbackRate(cents: number): number {
  return 2 ** (cents / CENTS_PER_OCTAVE);
}

/**
 * Returns the linear gain of a voice of `gain` dB on a channel at `volume`.
 *
 * The level clamps to 1, so no voice plays louder than its media at full scale.
 */
export function voiceLevel(volume: number, gain: number): number {
  return Math.min(MAX_LEVEL, volume * 10 ** (gain / 20));
}

/**
 * Returns the number of plays of a voice of `loopCount` that plays as `repeat` says.
 *
 * Returns null for a voice that loops until its key stops: a loop count of 0, and a voice that
 * `repeat` loops.
 */
export function loopPlays(loopCount: number, repeat: MediaRepeat): number | null {
  if (repeat === "loop" || loopCount <= 0) return null;

  return Math.round(loopCount);
}
