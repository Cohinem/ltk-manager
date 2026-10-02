import type { Screen } from "../../engine/layout/solve";

/** The most texels a frame target holds, about an 8K frame, which bounds its memory. */
const MAX_TEXELS = 36_000_000;

/**
 * The texels per screen pixel a frame renders at for a canvas showing `density` canvas pixels
 * per screen pixel: the next power of two at or above it, so a zoom does not reallocate the target
 * at each step, never below 1, and within the texel budget and `maxTexture` per side.
 */
export function renderScale(density: number, screen: Screen, maxTexture: number): number {
  const side = Math.max(screen.width, screen.height, 1);
  const area = Math.max(screen.width * screen.height, 1);
  const cap = Math.min(maxTexture / side, Math.sqrt(MAX_TEXELS / area));
  const largest = 2 ** Math.floor(Math.log2(Math.max(cap, 1)));
  const wanted = 2 ** Math.ceil(Math.log2(Math.max(density, 1)));
  return Math.min(wanted, largest);
}
