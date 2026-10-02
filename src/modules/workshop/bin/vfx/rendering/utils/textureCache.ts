import { LinearFilter, type Texture, TextureLoader } from "three";

import { createRetainedCache, loadCubeTexture, PARTICLE_COLOR_SPACE } from "@/modules/viewport";

/** How a url decodes: one flat image, or the six faces of a cube map stacked. */
export type TextureForm = "flat" | "cube";

/** One reference to a cached texture, which keeps it alive until released. */
export interface TextureRef {
  /** The texture once it has landed, null while it loads or where it failed. */
  readonly texture: Texture | null;
  /** The texture, or null for a load that failed. The first call starts the load. */
  load(): Promise<Texture | null>;
  release(): void;
}

/** One url's texture, shared by every reference to it. */
interface Shared {
  texture: Texture | null;
  loading: Promise<Texture | null> | null;
  /** The cache let the texture go, so a load that lands after it disposes what it read. */
  dropped: boolean;
}

const TEXTURES = createRetainedCache<string, Shared>((shared) => {
  shared.dropped = true;
  shared.texture?.dispose();
  shared.texture = null;
});

const LOADER = new TextureLoader();

/**
 * A reference to the texture at `url`, shared by every reference to the same url.
 *
 * Every particle texture takes the same sampler state, so one upload serves every emitter,
 * slot and viewport naming it. The texture outlives its last reference by the retained
 * cache's grace period, which covers a preview replaced by the next system naming the
 * same files.
 */
export function acquireTexture(url: string, form: TextureForm): TextureRef {
  const shared = TEXTURES.get(url, () => ({ texture: null, loading: null, dropped: false }));
  const release = TEXTURES.hold(url);

  return {
    get texture() {
      return shared.texture;
    },
    load() {
      shared.loading ??= fetchTexture(url, form).then((texture) => {
        /* A failure is not cached, so the next reference to ask loads the url again. */
        if (texture === null) {
          shared.loading = null;
          return null;
        }
        if (shared.dropped) {
          texture.dispose();
          return null;
        }

        shared.texture = texture;
        return texture;
      });
      return shared.loading;
    },
    release,
  };
}

async function fetchTexture(url: string, form: TextureForm): Promise<Texture | null> {
  const texture =
    form === "cube"
      ? await loadCubeTexture(url).catch(() => null)
      : await LOADER.loadAsync(url).catch(() => null);
  if (texture === null) return null;

  texture.colorSpace = PARTICLE_COLOR_SPACE;
  /* The first row is `v = 0`, as DirectX samples it, which is the space every uv formula
     here is written in. */
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  return texture;
}
