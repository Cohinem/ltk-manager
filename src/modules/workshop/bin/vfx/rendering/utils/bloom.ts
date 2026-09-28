import {
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";

/** How many times the glow halves before it spreads back up, which sets how far it reaches. */
const LEVELS = 5;

const VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* The dual filter's halving: the texel under the pixel and its four diagonal neighbours. */
const DOWN = /* glsl */ `
uniform sampler2D source;
uniform vec2 halfTexel;

varying vec2 vUv;

void main() {
  vec3 sum = texture2D(source, vUv).rgb * 4.0;
  sum += texture2D(source, vUv - halfTexel).rgb;
  sum += texture2D(source, vUv + halfTexel).rgb;
  sum += texture2D(source, vUv + vec2(halfTexel.x, -halfTexel.y)).rgb;
  sum += texture2D(source, vUv - vec2(halfTexel.x, -halfTexel.y)).rgb;
  gl_FragColor = vec4(sum / 8.0, 1.0);
}
`;

/* The dual filter's doubling, a tent of eight taps around the pixel, scaled by `strength`. */
const UP = /* glsl */ `
uniform sampler2D source;
uniform vec2 halfTexel;
uniform float strength;

varying vec2 vUv;

void main() {
  vec3 sum = texture2D(source, vUv + vec2(-halfTexel.x * 2.0, 0.0)).rgb;
  sum += texture2D(source, vUv + vec2(-halfTexel.x, halfTexel.y)).rgb * 2.0;
  sum += texture2D(source, vUv + vec2(0.0, halfTexel.y * 2.0)).rgb;
  sum += texture2D(source, vUv + vec2(halfTexel.x, halfTexel.y)).rgb * 2.0;
  sum += texture2D(source, vUv + vec2(halfTexel.x * 2.0, 0.0)).rgb;
  sum += texture2D(source, vUv + vec2(halfTexel.x, -halfTexel.y)).rgb * 2.0;
  sum += texture2D(source, vUv + vec2(0.0, -halfTexel.y * 2.0)).rgb;
  sum += texture2D(source, vUv + vec2(-halfTexel.x, -halfTexel.y)).rgb * 2.0;
  gl_FragColor = vec4(sum / 12.0 * strength, 1.0);
}
`;

/** The halved copies of one renderer's glow, and the quad that draws between them. */
interface BloomChain {
  readonly levels: readonly WebGLRenderTarget[];
  readonly down: ShaderMaterial;
  readonly up: ShaderMaterial;
  readonly quad: Mesh;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
}

const CHAINS = new WeakMap<WebGLRenderer, BloomChain>();

function chainOf(gl: WebGLRenderer): BloomChain {
  let chain = CHAINS.get(gl);
  if (chain === undefined) {
    const levels = Array.from(
      { length: LEVELS },
      () =>
        new WebGLRenderTarget(1, 1, {
          type: HalfFloatType,
          depthBuffer: false,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
        }),
    );
    const down = filterMaterial(DOWN);
    const up = filterMaterial(UP);
    const quad = new Mesh(new PlaneGeometry(2, 2), down);
    quad.frustumCulled = false;
    const scene = new Scene();
    scene.add(quad);

    chain = { levels, down, up, quad, scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    CHAINS.set(gl, chain);
  }

  return chain;
}

function filterMaterial(fragmentShader: string): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms: {
      source: { value: null },
      halfTexel: { value: new Vector2() },
      strength: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * `glow` blurred and added over the frame `gl` drew last, as the engine's bloom adds its
 * glow target.
 *
 * The glow halves `LEVELS` times with the dual filter, and each level doubles back onto the
 * one above it, adding its own. The sum is divided by `LEVELS` on the last doubling, which is
 * drawn onto the frame, so a wide glow of one value adds that value.
 */
export function drawBloom(gl: WebGLRenderer, glow: Texture, size: Vector2): void {
  const chain = chainOf(gl);
  const autoClear = gl.autoClear;
  gl.autoClear = false;

  let width = size.x;
  let height = size.y;
  let source = glow;
  for (const level of chain.levels) {
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    if (level.width !== width || level.height !== height) level.setSize(width, height);

    filter(gl, chain, chain.down, source, level, NoBlending, 1);
    source = level.texture;
  }

  for (let at = chain.levels.length - 1; at > 0; at -= 1) {
    const below = chain.levels[at];
    const above = chain.levels[at - 1];
    if (below === undefined || above === undefined) continue;

    filter(gl, chain, chain.up, below.texture, above, CustomBlending, 1);
  }

  const top = chain.levels[0];
  if (top !== undefined) {
    filter(gl, chain, chain.up, top.texture, null, CustomBlending, 1 / LEVELS);
  }

  gl.autoClear = autoClear;
}

/** Draw `source` through `material` into `target`, or onto the frame for null. */
function filter(
  gl: WebGLRenderer,
  { quad, scene, camera }: BloomChain,
  material: ShaderMaterial,
  source: Texture,
  target: WebGLRenderTarget | null,
  blending: typeof NoBlending | typeof CustomBlending,
  strength: number,
): void {
  const uniforms = material.uniforms;
  const image = source.image as { width: number; height: number };
  uniforms.source.value = source;
  (uniforms.halfTexel.value as Vector2).set(0.5 / image.width, 0.5 / image.height);
  uniforms.strength.value = strength;
  material.blending = blending;
  material.blendSrc = OneFactor;
  material.blendDst = OneFactor;
  quad.material = material;

  gl.setRenderTarget(target);
  gl.render(scene, camera);
}

/** Free the halved copies of `gl`, which its next bloom allocates again. */
export function releaseBloom(gl: WebGLRenderer): void {
  const chain = CHAINS.get(gl);
  if (chain === undefined) return;

  CHAINS.delete(gl);
  for (const level of chain.levels) level.dispose();
  chain.down.dispose();
  chain.up.dispose();
  chain.quad.geometry.dispose();
}
