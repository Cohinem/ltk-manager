import {
  DataTexture,
  LinearFilter,
  RepeatWrapping,
  ShaderMaterial,
  type Texture,
  Vector2,
} from "three";

import type { EmitterModel } from "../../engine/model/model";
import type { EmitterSamplers } from "../../rendering/hooks/useVfxTextures";
import { FRAGMENT } from "../../rendering/shaders/quad";
import { drawState, fragmentTests } from "../../rendering/utils/blend";
import {
  type LayerDraws,
  layerDefines,
  layerUniforms,
  layersOf,
} from "../../rendering/utils/uniforms";

/** The ramp a quad compiles, and no rim, reflection or soft fade, which need a scene around it. */
const DRAWS: LayerDraws = { ramp: true, sheen: false, fade: false };

/** How many copies of the particle a side of the tiled view shows, the particle in the middle. */
export const TILES = 3;

/**
 * The particle fragment of quad.ts over one quad filling a preview, fed per frame by uniforms.
 *
 * The material is the renderer's own for `emitter`: its layers, ramp, palette, erosion,
 * alpha lock, alpha test and blend. `particle*` carry what a quad's instanced attributes
 * carry, `extent` is the quad's half-size in clip space and `tiles` how many copies of the
 * texture a side shows. A distorting emitter warps `frame`, the preview's grid, in place of
 * the scene behind it, and `viewport` and `viewportOrigin` locate the preview on its canvas.
 */
export function surfaceMaterial(emitter: EmitterModel, samplers: EmitterSamplers): ShaderMaterial {
  const layers = layersOf(emitter, samplers, DRAWS);
  const state = drawState(emitter.blendMode, layers.distortion !== null);

  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      ...layerUniforms(samplers.base, layers, fragmentTests(emitter)),
      frame: { value: gridTexture() },
      viewport: { value: new Vector2(1, 1) },
      viewportOrigin: { value: new Vector2() },
      particleTint: { value: new Float32Array([1, 1, 1, 1]) },
      particleTurn: { value: [0, 1, 1] },
      particleShift: { value: [0, 0, 0, 0] },
      particleTurnMult: { value: [0, 1, 1] },
      particleShiftMult: { value: [0, 0, 0, 0] },
      particleLookup: { value: [0, 0] },
      particleErode: { value: 1 },
      extent: { value: new Vector2(1, 1) },
      tiles: { value: 1 },
    },
    defines: { ...layerDefines(samplers.base, layers), FALLOFF: "" },
    depthTest: false,
    depthWrite: false,
    transparent: state.transparent,
    blending: state.blending,
    blendSrc: state.blendSrc,
    blendDst: state.blendDst,
    blendEquation: state.blendEquation,
    blendSrcAlpha: state.blendSrcAlpha,
    blendDstAlpha: state.blendDstAlpha,
  });
}

const VERTEX = /* glsl */ `
uniform vec4 particleTint;
uniform vec3 particleTurn;
uniform vec4 particleShift;
uniform vec3 particleTurnMult;
uniform vec4 particleShiftMult;
uniform vec2 particleLookup;
uniform float particleErode;
uniform vec2 extent;
uniform float tiles;

varying vec2 vUv;
varying vec4 vColor;
varying vec3 vTurn;
varying vec4 vShift;
varying vec3 vTurnMult;
varying vec4 vShiftMult;
varying vec2 vLookup;
varying float vErode;

void main() {
  // The texture's first row is v = 0, so v runs down the quad as a particle's does.
  vUv = (vec2(uv.x, 1.0 - uv.y) - 0.5) * tiles + 0.5;
  vColor = particleTint;
  vTurn = particleTurn;
  vShift = particleShift;
  vTurnMult = particleTurnMult;
  vShiftMult = particleShiftMult;
  vLookup = particleLookup;
  vErode = particleErode;
  gl_Position = vec4(position.xy * extent, 0.0, 1.0);
}
`;

/** The grid a preview draws behind a distorting emitter, which the warp bends. */
export function backdropMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { grid: { value: gridTexture() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D grid;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(grid, vUv);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** The particle's own square among its tiled copies, sharing the surface's `extent` and `tiles`. */
export function outlineMaterial(surface: ShaderMaterial): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { extent: surface.uniforms.extent, tiles: surface.uniforms.tiles },
    vertexShader: /* glsl */ `
      uniform vec2 extent;
      uniform float tiles;
      void main() {
        gl_Position = vec4(position.xy * extent / tiles, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 0.6);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

/** The grid's side in texels, the cells across it, and its two shades as bytes. */
const GRID_SIDE = 128;
const GRID_CELLS = 8;
const GRID_GROUND = 28;
const GRID_LINE = 84;

let grid: Texture | null = null;

/** The grid a distorting preview stands on, drawn once and shared by every preview. */
function gridTexture(): Texture {
  if (grid !== null) return grid;

  const pixels = new Uint8Array(GRID_SIDE * GRID_SIDE * 4);
  const pitch = GRID_SIDE / GRID_CELLS;
  for (let y = 0; y < GRID_SIDE; y += 1) {
    for (let x = 0; x < GRID_SIDE; x += 1) {
      const line = x % pitch < 2 || y % pitch < 2;
      const at = (y * GRID_SIDE + x) * 4;
      pixels.fill(line ? GRID_LINE : GRID_GROUND, at, at + 3);
      pixels[at + 3] = 255;
    }
  }

  const texture = new DataTexture(pixels, GRID_SIDE, GRID_SIDE);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  grid = texture;
  return texture;
}
