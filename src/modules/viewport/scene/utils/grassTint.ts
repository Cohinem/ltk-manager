import type { Texture } from "three";

import type { AssetRef, MapGrassTint } from "@/lib/tauri";

/** The skin that a map shows when no skin is chosen. */
const DEFAULT_SKIN = "default";

/** The key that the base tint loads under. */
const BASE = "base";

/** One skin's loaded grass tints: the base, and the alternates that a visibility flag turns on. */
export interface GrassTextures {
  readonly base: Texture | null;
  readonly alternates: readonly { readonly bit: number; readonly texture: Texture }[];
}

/**
 * Returns the grass tint of `skin`. Falls back to the `Default` skin's, then to the first.
 * Returns `null` if no skin states a tint.
 */
export function grassTintOf(
  tints: readonly MapGrassTint[],
  skin: string | null,
): MapGrassTint | null {
  const named = (name: string) => tints.find((tint) => tint.skin.toLowerCase() === name);

  return (
    (skin === null ? undefined : named(skin.toLowerCase())) ??
    named(DEFAULT_SKIN) ??
    tints[0] ??
    null
  );
}

/** Returns the textures of `tint` to load, the base under `base` and each alternate by index. */
export function grassTintAssets(tint: MapGrassTint | null): ReadonlyMap<string, AssetRef> {
  const assets = new Map<string, AssetRef>();
  if (tint === null) return assets;

  assets.set(BASE, tint.texture);
  tint.alternates.forEach((alternate, at) => assets.set(String(at), alternate.texture));
  return assets;
}

/** Returns the loaded textures of `tint` out of `textures`. Skips an alternate still loading. */
export function grassTextures(
  tint: MapGrassTint | null,
  textures: ReadonlyMap<string, Texture>,
): GrassTextures | null {
  if (tint === null) return null;

  const alternates = tint.alternates.flatMap((alternate, at) => {
    const texture = textures.get(String(at));
    return texture === undefined ? [] : [{ bit: alternate.bit, texture }];
  });
  return { base: textures.get(BASE) ?? null, alternates };
}

/** Returns the first alternate whose flag is on in `flags`, else the base tint. */
export function grassTextureFor(tint: GrassTextures, flags: number): Texture | null {
  return tint.alternates.find(({ bit }) => (flags & (1 << bit)) !== 0)?.texture ?? tint.base;
}
