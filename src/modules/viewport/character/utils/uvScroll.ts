/**
 * How far a map scrolling at `rate` tiles a second stands at `time`, in tiles.
 *
 * A function of the clock rather than a sum of the frames, because one texture is drawn
 * by every placement of the skin that names it: a map stands a turret eleven times, and
 * an offset each of them advanced would run eleven times as fast. Read this way the
 * offset is the same whoever asks and in whatever order, as a pose is, so it also holds
 * still while a clock is paused and follows a seek.
 *
 * The turns are folded into the first tile, which a repeating sampler reads identically
 * and which keeps the float exact through a long session.
 */
export function scrollAt(rate: number, time: number): number {
  const turns = rate * time;
  /* A rate or a time that is no number would put a NaN on the sampler, which drops the
     draw rather than the scroll. */
  if (!Number.isFinite(turns)) return 0;
  return turns - Math.floor(turns);
}
