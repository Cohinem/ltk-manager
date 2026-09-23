import { useEffect, useState } from "react";
import { type ColorSpace, RepeatWrapping, Texture, TextureLoader, type Wrapping } from "three";

import { previewMipsUrl, previewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { readMipBuffer } from "../../assets/parsing/mipBuffer";
import { TEXTURE_COLOR_SPACE } from "../../scene/utils/world";

const NONE: ReadonlyMap<string, Texture> = new Map();

/** How many textures are asked for at once where the caller states no number. */
const CONCURRENT = 4;

/**
 * How long one request has to answer before the wave gives up on it.
 *
 * An `<img>` whose request never completes fires neither event, and a wave waits on every
 * load it started, so one such request would hold the whole set at the width the first
 * pass landed.
 */
const REQUEST_TIMEOUT_MS = 30_000;

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
  /**
   * Each texture draws the file's own mip chain rather than one the GPU averages.
   *
   * An alpha-tested texture ships every level at binary alpha with level 0's coverage,
   * and an averaged level fades the cutout away with distance.
   */
  readonly mips?: boolean;
  /**
   * The space the texels are read in, the stage's sRGB unless said otherwise.
   *
   * A program of the game's own shader decodes its texels itself, so it takes them raw.
   */
  readonly colorSpace?: ColorSpace;
  /**
   * The address mode a texture starts with, the engine's wrap unless said otherwise. A
   * material sampler narrows it where it names another.
   */
  readonly wrap?: Wrapping;
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
  {
    previewWidth,
    fullWidth,
    concurrency = CONCURRENT,
    mips = false,
    colorSpace = TEXTURE_COLOR_SPACE,
    wrap = RepeatWrapping,
    report,
  }: TextureLoad = {},
): ReadonlyMap<string, Texture> {
  const [textures, setTextures] = useState(NONE);

  useEffect(() => {
    let live = true;
    const loaded = new Map<string, Texture>();
    /* What the first wave landed, which says whether the second would answer the same
       bytes, and what the second replaced, which nothing draws once it has. */
    const widths = new Map<string, number>();
    const superseded: Texture[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
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
      texture.colorSpace = colorSpace;
      texture.wrapS = wrap;
      texture.wrapT = wrap;
      /* The first row is `v = 0`, as DirectX samples it and the game unwraps. */
      texture.flipY = false;
      /* Kept rather than let go here: a material draws the one it was bound to until the
         map naming its replacement reaches the scene, which is a frame away. */
      const replaced = loaded.get(key);
      if (replaced !== undefined) superseded.push(replaced);
      loaded.set(key, texture);
      /* The decoded image, which ThreeJS types as whatever a loader put there. */
      const source = texture.image as { width?: number } | null | undefined;
      widths.set(key, source?.width ?? 0);
      publish();
    };

    const load = (
      key: string,
      asset: AssetRef,
      width: number | undefined,
      done: (ok: boolean) => void,
    ) => {
      const url = previewUrl(asset, width);
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        timers.delete(timer);
        done(ok);
      };
      const timer = setTimeout(() => {
        console.error("Gave up on a texture that never answered:", url);
        finish(false);
      }, REQUEST_TIMEOUT_MS);
      timers.add(timer);

      const landed = (texture: Texture) => {
        if (!live || settled) {
          texture.dispose();
          return;
        }
        take(key, texture);
        finish(true);
      };
      const failed = (error: unknown) => {
        if (!live) return;
        console.error("Failed to read a texture:", error);
        finish(false);
      };

      const image = () => loader.load(url, landed, undefined, failed);
      /* A PNG or a TGA has no chain to answer with, so it arrives as the image it is. */
      if (mips) loadMips(previewMipsUrl(asset, width)).then(landed, image);
      else image();
    };

    /** One wave over `entries`, no more than `concurrency` of them in flight. */
    const wave = (
      entries: readonly (readonly [string, AssetRef])[],
      width: number | undefined,
      settled: (ok: boolean) => void,
      finished: () => void,
    ) => {
      const queue = [...entries];
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
          load(next[0], next[1], width, (ok) => {
            running -= 1;
            settled(ok);
            pump();
          });
        }
      };
      pump();
    };

    /**
     * Whether a second ask for `key` would land anything the first did not.
     *
     * The scheme answers the smallest mip at least the width asked for. One already at
     * least `fullWidth` wide is the level the second ask picks too, and one under
     * `previewWidth` is level 0 because the chain holds nothing wider, so both are the
     * same bytes decoded and uploaded twice.
     */
    const sharpens = (key: string): boolean => {
      const landed = widths.get(key);
      if (landed === undefined || previewWidth === undefined) return true;
      if (fullWidth !== undefined && landed >= fullWidth) return false;
      return landed >= previewWidth;
    };

    const count = (ok: boolean) => {
      pending -= 1;
      if (!ok) failed += 1;
      report?.({ pending, failed });
    };
    const whole = () => {
      const queue = [...assets].filter(([key]) => sharpens(key));
      pending -= assets.size - queue.length;
      report?.({ pending, failed });
      wave(queue, fullWidth, count, () => {});
    };

    if (previewWidth === undefined) wave([...assets], fullWidth, count, () => {});
    else wave([...assets], previewWidth, () => {}, whole);

    return () => {
      live = false;
      if (frame !== 0) cancelAnimationFrame(frame);
      for (const timer of timers) clearTimeout(timer);
      for (const texture of loaded.values()) texture.dispose();
      for (const texture of superseded) texture.dispose();
      setTextures(NONE);
    };
  }, [assets, previewWidth, fullWidth, concurrency, mips, colorSpace, wrap, report]);

  return textures;
}

/**
 * A texture drawing every level of the chain `url` answers, as the file stores them.
 *
 * A chain of one level is the whole file, so the GPU builds its mipmaps as for any image.
 */
async function loadMips(url: string): Promise<Texture> {
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(await answer.text());
  const levels = readMipBuffer(await answer.arrayBuffer());
  const images = await Promise.all(
    levels.map(({ png }) =>
      createImageBitmap(new Blob([png], { type: "image/png" }), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      }),
    ),
  );
  const texture = new Texture(images[0]);
  if (images.length > 1) {
    /* ThreeJS uploads any image source level by level and types the levels as canvases. */
    texture.mipmaps = images as unknown as HTMLCanvasElement[];
    texture.generateMipmaps = false;
  }
  texture.needsUpdate = true;
  /* A bitmap keeps its pixels until it is closed, where an image lets the browser drop them. */
  texture.addEventListener("dispose", () => {
    for (const image of images) image.close();
  });
  return texture;
}
