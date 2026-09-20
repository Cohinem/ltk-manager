import { useEffect, useState } from "react";
import { type Texture, TextureLoader } from "three";

import { previewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { TEXTURE_COLOR_SPACE } from "../../scene/utils/world";

const NONE: ReadonlyMap<string, Texture> = new Map();

/** How a set of textures arrives, where one whole-size wave is not wanted. */
export interface TextureLoad {
  /**
   * A mip at least this wide lands first, and the whole texture replaces it after every
   * one of them has. A map is 183 textures, so a first pass a mip wide is the difference
   * between seconds of grey and a drawn map that sharpens.
   */
  readonly previewWidth?: number;
  readonly report?: (load: { pending: number; failed: number }) => void;
}

/**
 * Each asset as a texture the viewport draws with, under the key it was asked by.
 *
 * A texture lands on its own and the map is republished once a frame rather than once
 * per arrival, so a caller rebuilding off this map pays for a frame rather than for a
 * texture. The caller holds `assets` stable, because a new map is a new set of loads.
 */
export function useAssetTextures(
  assets: ReadonlyMap<string, AssetRef>,
  { previewWidth, report }: TextureLoad = {},
): ReadonlyMap<string, Texture> {
  const [textures, setTextures] = useState(NONE);

  useEffect(() => {
    let live = true;
    const loaded = new Map<string, Texture>();
    const loader = new TextureLoader();
    let frame = 0;
    let pending = assets.size;
    let failed = 0;
    report?.({ pending, failed });

    /* One publish a frame. 183 textures landing one state update each is 183 rebuilds of
       whatever draws them, which is the whole cost on a map. */
    const publish = () => {
      if (frame !== 0 || !live) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (live) setTextures(new Map(loaded));
      });
    };

    const take = (key: string, texture: Texture) => {
      texture.colorSpace = TEXTURE_COLOR_SPACE;
      /* The first row is `v = 0`, as DirectX samples it and the game unwraps. */
      texture.flipY = false;
      loaded.get(key)?.dispose();
      loaded.set(key, texture);
      publish();
    };

    const load = (key: string, url: string, done: (ok: boolean) => void) =>
      loader.load(
        url,
        (texture) => {
          if (!live) {
            texture.dispose();
            return;
          }
          take(key, texture);
          done(true);
        },
        undefined,
        (error) => {
          if (!live) return;
          console.error("Failed to read a texture:", error);
          done(false);
        },
      );

    const whole = () => {
      for (const [key, asset] of assets) {
        load(key, previewUrl(asset), (ok) => {
          pending -= 1;
          if (!ok) failed += 1;
          report?.({ pending, failed });
        });
      }
    };

    if (previewWidth === undefined) {
      whole();
    } else {
      let waiting = assets.size;
      const settled = () => {
        waiting -= 1;
        if (waiting === 0 && live) whole();
      };
      if (waiting === 0) whole();
      for (const [key, asset] of assets) load(key, previewUrl(asset, previewWidth), settled);
    }

    return () => {
      live = false;
      if (frame !== 0) cancelAnimationFrame(frame);
      for (const texture of loaded.values()) texture.dispose();
      setTextures(NONE);
    };
  }, [assets, previewWidth, report]);

  return textures;
}
