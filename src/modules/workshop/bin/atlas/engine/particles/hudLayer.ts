import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { field, number } from "../../../vfx/engine/parsing/readValue";

/** The space a HUD-layer system is authored in, in its own units. */
export interface HudLayer {
  readonly width: number;
  readonly height: number;
}

const FIELDS = {
  flags: nameHash("flags"),
  dimension: nameHash("hudLayerDimension"),
  aspect: nameHash("HudLayerAspect"),
};

/** The schema defaults of `flags`, `hudLayerDimension` and `HudLayerAspect`. */
const FLAGS_DEFAULT = 212;
const DIMENSION_DEFAULT = 1024;
const ASPECT_DEFAULT = 4 / 3;
/** The bit of `flags` under which the layer is the owning element's source resolution. */
const ELEMENT_SPACE = 0x200;

/**
 * The layer a system draws its HUD space in, per section 2.6 of docs/plans/atlas-renderer.md:
 * `hudLayerDimension` wide and that over `HudLayerAspect` high, or the element's `source`
 * resolution under bit `0x200` of `flags`.
 */
export function hudLayerOf(root: VfxValue, source: readonly [number, number]): HudLayer {
  const flags = number(field(root, FIELDS.flags)) ?? FLAGS_DEFAULT;
  const [sourceW, sourceH] = source;
  if ((flags & ELEMENT_SPACE) !== 0 && sourceW > 0 && sourceH > 0) {
    return { width: sourceW, height: sourceH };
  }

  const dimension = number(field(root, FIELDS.dimension)) ?? DIMENSION_DEFAULT;
  const aspect = number(field(root, FIELDS.aspect)) ?? ASPECT_DEFAULT;
  return { width: dimension, height: dimension / aspect };
}

/** How many screen pixels one layer unit covers on a screen `screenHeight` tall. */
export function hudPixelsPerUnit(layer: HudLayer, screenHeight: number, scale: number): number {
  return (screenHeight * scale) / layer.height;
}
