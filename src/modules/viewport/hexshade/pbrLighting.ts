import { DataUtils } from "three";

import type { SunColor, SunLight } from "../scene/utils/sunLight";

/** The layers of `LIGHT_GRID_TEXTURE`: the ambient cube's six faces, then the sun's mask. */
export const GRID_LAYERS = 7;

/** The layers of one cube in `IBL_CUBEMAP`, in the face order the shader samples. */
export const CUBE_LAYERS = 6;

/** The width of one sky cube face. The sky is a gradient, so few texels hold it. */
export const SKY_FACE_SIZE = 16;

/** The display gamma that `LIT_UBER`'s physically based permutation decodes colours with. */
const GAMMA = 2.2;

const RGBA = 4;

/**
 * How much of the sky's light the sky cube states. A judgement against the shipped permutation,
 * which adds `HDR_ENV_DIFFUSE_SCALE` times this to the light grid and the sun.
 */
const SKY_RADIANCE = 0.25;

/** Each cube face's direction for a texel at `u`, `v`, the inverse of `dxbcCubeArrayLod`. */
const FACE_DIRECTIONS: readonly ((u: number, v: number) => readonly [number, number, number])[] = [
  (u, v) => [1, -v, -u],
  (u, v) => [-1, -v, u],
  (u, v) => [u, 1, v],
  (u, v) => [u, -1, -v],
  (u, v) => [u, -v, 1],
  (u, v) => [-u, -v, -1],
];

function linear(channel: number): number {
  return Math.max(channel, 0) ** GAMMA;
}

/**
 * The texels of `LIGHT_GRID_TEXTURE` for one ambient cube, one texel per layer.
 *
 * The permutation divides the layer by pi and the base permutation does not, and a dielectric
 * reads at the base permutation's brightness under this scale. Layer six is the sun's mask,
 * which stays one because the preview draws no shadow.
 */
export function gridLayerTexels(cube: readonly SunColor[], out: Float32Array): void {
  cube.forEach(([r, g, b], face) => {
    const at = face * RGBA;
    out[at] = Math.PI * linear(Math.min(r, 1));
    out[at + 1] = Math.PI * linear(Math.min(g, 1));
    out[at + 2] = Math.PI * linear(Math.min(b, 1));
    out[at + 3] = 1;
  });
  out.fill(1, cube.length * RGBA);
}

/**
 * The half-float texels of a cube that stands in for a map's `MapCubemapProbe`: the ground, the
 * horizon and the sky of `light` as a vertical gradient.
 */
export function skyCubeTexels(light: SunLight, size = SKY_FACE_SIZE): Uint16Array {
  const { sky, ground, ambient, horizon = sky } = light;
  const texels = new Uint16Array(size * size * CUBE_LAYERS * RGBA);
  const one = DataUtils.toHalfFloat(1);

  let at = 0;
  for (const direction of FACE_DIRECTIONS) {
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const u = ((column + 0.5) / size) * 2 - 1;
        const v = ((row + 0.5) / size) * 2 - 1;
        const [x, y, z] = direction(u, v);
        const height = y / Math.hypot(x, y, z);
        const end = height > 0 ? sky : ground;
        const reach = Math.abs(height);

        for (let channel = 0; channel < 3; channel += 1) {
          const edge = horizon[channel] ?? 0;
          const colour = edge + ((end[channel] ?? 0) - edge) * reach;
          texels[at + channel] = DataUtils.toHalfFloat(linear(colour) * ambient * SKY_RADIANCE);
        }
        texels[at + 3] = one;
        at += RGBA;
      }
    }
  }
  return texels;
}
