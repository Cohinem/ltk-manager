import type { ViewRect } from "../model/view";
import {
  anchorsOf,
  clampedSize,
  FULL_SAFE_ZONE,
  type LayoutSettings,
  lerp,
  scaleOf,
  sourceOf,
} from "./solve";

/**
 * The `Position` that draws the centre of `rect` at the screen point `centre`, for a rect an
 * anchor pins to the screen: the rect solve of `solve.ts` solved for the position, before any
 * snap.
 */
export function positionAt(
  rect: ViewRect,
  centre: readonly [number, number],
  settings: LayoutSettings,
): [number, number] {
  const { screen } = settings;
  const [sourceW, sourceH] = sourceOf(rect, screen);
  const [w, h] = clampedSize(rect);
  const zone = rect.ignoreSafeZone ? FULL_SAFE_ZONE : settings.safeZone;
  const k = zone.y1 - zone.y0;
  const g = scaleOf(rect, sourceH, settings);
  const kx = (k * (sourceW / sourceH)) / (screen.width / screen.height);
  const [[anchorX, anchorY]] = anchorsOf(rect.anchor);

  const x = (centre[0] / screen.width - lerp(zone.x0, zone.x1, anchorX)) / (g * kx) + anchorX;
  const y = (centre[1] / screen.height - lerp(zone.y0, zone.y1, anchorY)) / (g * k) + anchorY;
  return [x * sourceW - w / 2, y * sourceH - h / 2];
}
