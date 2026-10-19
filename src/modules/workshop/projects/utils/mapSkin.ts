import type { MapStart } from "@/lib/tauri";

/** Lowercased name of the default skin of a map. */
const DEFAULT_SKIN = "default";

/**
 * Returns the skin of `map` named `chosen`. Falls back to the `Default` skin, then to the first
 * skin. Returns `null` if `map` lists no skin.
 */
export function skinOf(map: MapStart | null, chosen: string | null): string | null {
  const skins = map?.skins ?? [];
  const named = (name: string) => skins.find((each) => each.skin.toLowerCase() === name)?.skin;

  return (
    (chosen === null ? undefined : named(chosen.toLowerCase())) ??
    named(DEFAULT_SKIN) ??
    skins[0]?.skin ??
    null
  );
}
