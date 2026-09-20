import type { MapVariant } from "@/lib/tauri";

/** The skin a map plays under when nothing picks another, by the name every map gives it. */
const DEFAULT_SKIN = "default";

/** The variant a preview opens on: the map's `Default` skin, else the first it names. */
export function openingVariant(variants: readonly MapVariant[]): MapVariant | null {
  return (
    variants.find((variant) => variant.skin?.toLowerCase() === DEFAULT_SKIN) ?? variants[0] ?? null
  );
}

/** What a variant's row reads: its skin's name, else the last segment of the map's path. */
export function variantLabel(variant: MapVariant): string {
  return variant.skin ?? variant.map.slice(variant.map.lastIndexOf("/") + 1);
}
