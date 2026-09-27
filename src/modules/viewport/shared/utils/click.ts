/** The farthest a click travels between press and release, in pixels. A longer press is a drag. */
export const CLICK_SLOP = 4;

/** A pointer's place on the screen, in CSS pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Whether a press at `from` released at `to` is a click rather than a camera drag. */
export function isClick(from: ScreenPoint, to: ScreenPoint): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) <= CLICK_SLOP;
}
