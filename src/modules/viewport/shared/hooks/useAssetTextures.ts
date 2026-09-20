import { useEffect, useState } from "react";
import { type Texture, TextureLoader } from "three";

import { previewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { TEXTURE_COLOR_SPACE } from "../../scene/utils/world";

const NONE: ReadonlyMap<string, Texture> = new Map();

/** How many textures are asked for at once where the caller states no number. */
const CONCURRENT = 4;

/** How a set of textures arrives, where one whole-size wave is not wanted. */
export interface TextureLoad {
  /**
   * A mip at least this wide lands first, and the full texture replaces it after every
   * one of them has. A map is 183 textures, so a first pass a mip wide is the difference
   * between seconds of grey and a drawn map that sharpens.
   */
  readonly previewWidth?: number;
  /**
   * The widest the second wave asks for, and undefined for the whole texture.
   *
   * A backdrop draws behind its subject, where the whole of a 2048 kit texture is
   * bytes the frame never resolves.
   */
  readonly fullWidth?: number;
  /**
   * How many textures are in flight at once.
   *
   * Every request costs a decode in the backend and an upload on the render thread, so
   * asking for a whole set at once lands them in bursts a frame cannot absorb.
   */
  readonly concurrency?: number;
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
  { previewWidth, fullWidth, concurrency = CONCURRENT, report }: TextureLoad = {},
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

    /** One wave over every asset, no more than `concurrency` of them in flight. */
    const wave = (
      width: number | undefined,
      settled: (ok: boolean) => void,
      finished: () => void,
    ) => {
      const queue = [...assets];
      let running = 0;
      const pump = () => {
        if (!live) return;
        if (running === 0 && queue.length === 0) {
          finished();
          return;
        }
        while (running < concurrency && queue.length > 0) {
          const next = queue.shift();
          if (next === undefined) break;
          running += 1;
          load(next[0], previewUrl(next[1], width), (ok) => {
            running -= 1;
            settled(ok);
            pump();
          });
        }
      };
      pump();
    };

    const count = (ok: boolean) => {
      pending -= 1;
      if (!ok) failed += 1;
      report?.({ pending, failed });
    };
    const whole = () => wave(fullWidth, count, () => {});

    if (previewWidth === undefined) whole();
    else {
      wave(previewWidth, () => {}, whole);
    }

    return () => {
      live = false;
      if (frame !== 0) cancelAnimationFrame(frame);
      for (const texture of loaded.values()) texture.dispose();
      setTextures(NONE);
    };
  }, [assets, previewWidth, fullWidth, concurrency, report]);

  return textures;
}
