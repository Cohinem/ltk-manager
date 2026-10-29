import type { MediaRepeat } from "../player/soundPlayer";

/**
 * One sound event of a pass, as a viewport fires it: which event, when, and how it stops.
 *
 * Per "Viewport sound" in docs/ux/AUDIO.md.
 */
export interface SoundCue {
  /** One key per event of the pass, which the voices of one firing play under. */
  readonly key: string;
  /** The Wwise event name. */
  readonly name: string;
  /** Seconds into the pass the event fires. */
  readonly at: number;
  /** Seconds into the pass of the end frame, and null for none. Read by the skip rule alone. */
  readonly endAt: number | null;
  /** `mIsKillEvent`: the sound stops when its clip stops or starts over. */
  readonly kill: boolean;
  /** `mIsLoop`: the event fires on every pass, and on the first pass alone when false. */
  readonly loop: boolean;
  /** `mSkipIfPastEndFrame`: a crossing that lands past `endAt` fires nothing. */
  readonly skipIfPastEnd: boolean;
  /** How the media plays: once to its end, or looped until its key stops. */
  readonly repeat: MediaRepeat;
}
