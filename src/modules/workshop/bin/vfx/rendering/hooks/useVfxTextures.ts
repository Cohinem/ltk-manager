import { useEffect, useState } from "react";
import { DataTexture, LinearFilter, type Texture, TextureLoader } from "three";

import { previewCubeUrl } from "@/lib/previewUrl";
import { loadCubeTexture, PARTICLE_COLOR_SPACE } from "@/modules/viewport";

import { previewUrl } from "../../../../preview/utils/assetRef";
import { assetLoad, type AssetLoad } from "../utils/assetLoad";
import type { DrawnEmitter } from "../utils/definitions";

/** The samplers one emitter draws with, null for one it names nothing for or that has not arrived. */
export interface EmitterSamplers {
  readonly base: Texture | null;
  readonly mult: Texture | null;
  readonly color: Texture | null;
  readonly palette: Texture | null;
  readonly erosion: Texture | null;
  /** `normalMapTexture`, whose direction a distorting emitter warps the screen along. */
  readonly normal: Texture | null;
  /** `reflectionMapTexture`, the cube map a mesh reflects. */
  readonly reflection: Texture | null;
}

/** One bundle per drawn emitter, by the drawn emitter's key. */
export type VfxTextures = ReadonlyMap<string, EmitterSamplers>;

const EMPTY: VfxTextures = new Map();

/** No sampler of the emitter's has arrived. */
export const NO_SAMPLERS: EmitterSamplers = Object.freeze({
  base: null,
  mult: null,
  color: null,
  palette: null,
  erosion: null,
  normal: null,
  reflection: null,
});

/**
 * What slot 0 holds for an emitter naming no texture, the engine's 1x1 transparent black.
 *
 * Such an emitter draws nothing of its own and carries only its children.
 */
const UNNAMED = unnamedTexture();

function unnamedTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array(4), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

/** `NO_SAMPLERS`, its base slot seeded with `UNNAMED` for an emitter naming no texture. */
export const UNNAMED_SAMPLERS: EmitterSamplers = Object.freeze({ ...NO_SAMPLERS, base: UNNAMED });

/** The samplers `definition` draws with: the held bundle, or a stand-in before one arrives. */
export function samplersOf(textures: VfxTextures, definition: DrawnEmitter): EmitterSamplers {
  const held = textures.get(definition.key);
  if (held !== undefined) return held;
  return definition.emitter.texture === null ? UNNAMED_SAMPLERS : NO_SAMPLERS;
}

/**
 * The textures each drawn emitter draws with, loaded off the `ltk-asset` scheme.
 *
 * The pixels never cross the JavaScript heap and the renderer adds no decode path
 * (decision 2.2 of docs/plans/vfx-particle-renderer.md). An emitter whose texture the
 * install does not ship draws untextured rather than not at all.
 */
export function useVfxTextures(
  drawn: readonly DrawnEmitter[],
  report?: (load: AssetLoad) => void,
  minWidth?: number,
): VfxTextures {
  const [textures, setTextures] = useState<VfxTextures>(EMPTY);

  useEffect(() => {
    const requests = drawn
      .flatMap(({ key, emitter }) => [
        { key, slot: "base" as const, named: emitter.texture },
        { key, slot: "mult" as const, named: emitter.multTexture },
        { key, slot: "color" as const, named: emitter.colorTexture },
        { key, slot: "palette" as const, named: emitter.palette?.texture ?? null },
        { key, slot: "erosion" as const, named: emitter.erosion?.map ?? null },
        { key, slot: "normal" as const, named: emitter.distortion?.map ?? null },
        { key, slot: "reflection" as const, named: emitter.reflection?.map ?? null },
      ])
      .filter(({ named }) => named !== null);
    const batch = assetLoad(requests.length, report);
    if (drawn.length === 0) {
      setTextures(EMPTY);
      return;
    }

    let live = true;
    const bundles = new Map<string, EmitterSamplers>();
    for (const { key, emitter } of drawn) {
      if (emitter.texture === null) bundles.set(key, UNNAMED_SAMPLERS);
    }
    setTextures(new Map(bundles));

    const loader = new TextureLoader();

    const take = (key: string, slot: keyof EmitterSamplers, texture: Texture) => {
      if (!live) {
        texture.dispose();
        return;
      }
      texture.colorSpace = PARTICLE_COLOR_SPACE;
      /* The first row is `v = 0`, as DirectX samples it, which is the space every uv
         formula here is written in. */
      texture.flipY = false;
      texture.minFilter = LinearFilter;
      const held = bundles.get(key) ?? NO_SAMPLERS;
      bundles.set(key, { ...held, [slot]: texture });
      setTextures(new Map(bundles));
    };

    let next = 0;
    let running = 0;
    const concurrency = minWidth === undefined ? Infinity : 2;
    const done = (failed = false) => {
      running -= 1;
      batch.done(failed);
      queueMicrotask(pump);
    };

    const load = ({ key, slot, named }: (typeof requests)[number]) => {
      const asset = named?.asset;
      if (asset == null) {
        done(true);
        return;
      }
      if (slot !== "reflection") {
        loader.load(
          previewUrl(asset, minWidth),
          (texture) => {
            take(key, slot, texture);
            done();
          },
          undefined,
          () => done(true),
        );
      } else {
        void loadCubeTexture(previewCubeUrl(asset))
          .then((texture) => {
            if (texture !== null) take(key, slot, texture);
            done(texture === null);
          })
          .catch(() => done(true));
      }
    };

    function pump() {
      while (live && running < concurrency && next < requests.length) {
        const request = requests[next]!;
        next += 1;
        running += 1;
        load(request);
      }
    }

    pump();

    return () => {
      live = false;
      batch.cancel();
      for (const bundle of bundles.values()) {
        for (const texture of Object.values(bundle)) {
          if (texture !== null && texture !== UNNAMED) texture.dispose();
        }
      }
      setTextures(EMPTY);
    };
  }, [drawn, report, minWidth]);

  return textures;
}
