import {
  type Camera,
  Matrix4,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
} from "three";

import { type AmbientOcclusion, occlusionSamples } from "./ambientOcclusion";

/** The most samples a pixel gathers, the game's 8-sample permutation. */
const MOST_SAMPLES = 8;

/** The side of the square the per-pixel rotations tile in, as the game's noise texture does. */
const NOISE_SIDE = 4;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** `count` directions spread evenly over a sphere, the golden-angle spiral. */
function sphere(count: number): Vector3[] {
  return Array.from({ length: count }, (_, at) => {
    const y = 1 - (2 * (at + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const angle = at * GOLDEN_ANGLE;
    return new Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
  });
}

/* The game sets `SSAOKernel` and its noise texture outside the shader, so both are the
   preview's own: directions over a sphere, each reach growing with the square of its index. */
function kernelOf(samples: number): Vector4[] {
  const directions = sphere(samples);
  return Array.from({ length: MOST_SAMPLES }, (_, at) => {
    const direction = directions[at];
    if (direction === undefined) return new Vector4();
    const share = (at + 1) / samples;
    return new Vector4(direction.x, direction.y, direction.z, 0.1 + 0.9 * share * share);
  });
}

const KERNELS = { 4: kernelOf(4), 8: kernelOf(8) } as const;

/* Scrambled so neighbouring pixels do not turn their samples by neighbouring angles. */
const NOISE = sphere(NOISE_SIDE * NOISE_SIDE).map(
  (_, at, all) => all[(at * 7) % all.length] as Vector3,
);

const VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const OCCLUSION = /* glsl */ `
#define MOST_SAMPLES ${MOST_SAMPLES}
#define NOISE_SIDE ${NOISE_SIDE.toFixed(1)}

uniform sampler2D sceneDepth;
uniform mat4 projection;
uniform mat4 projectionInverse;
uniform vec4 kernel[MOST_SAMPLES];
uniform vec3 noise[${NOISE_SIDE * NOISE_SIDE}];
uniform int samples;
uniform float sampleRadius;
uniform float bias;
uniform float power;

varying vec2 vUv;

/* The depth texel under a point, rebuilt at that texel's own centre. The occlusion is drawn
   smaller than the depth, so its pixel centres fall on texel borders, and a position rebuilt
   at the point from whichever texel the border resolves to steps along rows and columns. */
vec4 sceneAt(vec2 at) {
  vec2 texels = vec2(textureSize(sceneDepth, 0));
  vec2 texel = clamp(floor(at * texels), vec2(0.0), texels - 1.0);
  float depth = texelFetch(sceneDepth, ivec2(texel), 0).x;
  vec2 centre = (texel + 0.5) / texels;
  vec4 view = projectionInverse * vec4(vec3(centre, depth) * 2.0 - 1.0, 1.0);
  return vec4(view.xyz / view.w, depth);
}

void main() {
  vec4 scene = sceneAt(vUv);
  vec3 center = scene.xyz;
  if (scene.w >= 1.0) {
    gl_FragColor = vec4(1.0, -center.z * 0.1, 0.0, 1.0);
    return;
  }

  vec3 normal = normalize(cross(dFdx(center), dFdy(center)));
  if (dot(normal, center) > 0.0) normal = -normal;
  vec2 cell = mod(floor(gl_FragCoord.xy), NOISE_SIDE);
  vec3 turn = noise[int(cell.x + cell.y * NOISE_SIDE)];

  float occluded = 0.0;
  for (int i = 0; i < MOST_SAMPLES; i++) {
    if (i >= samples) break;
    vec3 reach = normalize(reflect(kernel[i].xyz, turn)) * sampleRadius * kernel[i].w;
    vec3 probe = center + reach * sign(dot(reach, normal));
    vec4 clip = projection * vec4(probe, 1.0);
    vec2 at = clip.xy / clip.w * 0.5 + 0.5;
    float sceneZ = sceneAt(at).z;
    float gap = sceneZ - center.z;
    float range = gap > 0.0 ? clamp(sampleRadius / gap, 0.0, 1.0) : 0.0;
    if (sceneZ > probe.z + bias) occluded += range * range * (3.0 - 2.0 * range);
  }

  float open = 1.0 - occluded / float(samples);
  gl_FragColor = vec4(pow(abs(open), power), -center.z * 0.1, 0.0, 1.0);
}
`;

const BLUR = /* glsl */ `
uniform sampler2D occlusion;
uniform vec2 stride;
uniform bool edgeAware;

varying vec2 vUv;

const float WEIGHTS[5] = float[5](1.0 / 8.0, 2.0 / 8.0, 2.0 / 8.0, 2.0 / 8.0, 1.0 / 8.0);

void main() {
  vec2 center = texture2D(occlusion, vUv).xy;
  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 tap = texture2D(occlusion, vUv + float(i - 2) * stride).xy;
    float value = edgeAware ? mix(tap.x, center.x, clamp(center.y - tap.y, 0.0, 1.0)) : tap.x;
    sum += value * WEIGHTS[i];
  }
  gl_FragColor = vec4(sum, center.y, 0.0, 1.0);
}
`;

/**
 * The screen pass measuring each pixel's ambient occlusion off the scene's depth.
 *
 * Ported from the game's `ssao/ssaosimple.ps`. A pixel's normal comes from its neighbours'
 * positions, and each sample is a kernel direction turned by the pixel's noise and flipped
 * to the normal's side. A sample counts where the scene lies more than `bias` in front of
 * it, weighted down the further that scene lies in front of the pixel itself. Red is the
 * unoccluded share raised to `power`, and green is the pixel's distance over ten, which
 * the blur reads its edges from.
 */
export function occlusionMaterial(depth: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: OCCLUSION,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      sceneDepth: { value: depth },
      projection: { value: new Matrix4() },
      projectionInverse: { value: new Matrix4() },
      kernel: { value: KERNELS[4] },
      noise: { value: NOISE },
      samples: { value: 4 },
      sampleRadius: { value: 0 },
      bias: { value: 0 },
      power: { value: 1 },
    },
  });
}

/** Point `material`'s uniforms at `occlusion`, seen through `camera`. */
export function writeOcclusion(
  material: ShaderMaterial,
  occlusion: AmbientOcclusion,
  camera: Camera,
): void {
  const uniforms = material.uniforms;
  const samples = occlusionSamples(occlusion);
  (uniforms.projection.value as Matrix4).copy(camera.projectionMatrix);
  (uniforms.projectionInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
  uniforms.kernel.value = KERNELS[samples];
  uniforms.samples.value = samples;
  uniforms.sampleRadius.value = occlusion.sampleRadius;
  uniforms.bias.value = occlusion.bias;
  uniforms.power.value = occlusion.power;
}

/**
 * One direction of the blur over the occlusion, ported from the game's
 * `filters/gauss5_edge_aware.ps`.
 *
 * Five taps weighted 1, 2, 2, 2 and 1 over 8, where the game's weigh 1, 4, 7, 4 and 1 over
 * 17, because these cancel the four-pixel noise tile rather than leave a grid of it. An
 * edge-aware tap nearer the camera than the centre by ten world units or more gives the
 * centre's own occlusion instead of its own.
 */
export function occlusionBlurMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: BLUR,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      occlusion: { value: null },
      stride: { value: new Vector2() },
      edgeAware: { value: true },
    },
  });
}

/** Point `material` at `source`, one texel across `size` along `axis`. */
export function writeOcclusionBlur(
  material: ShaderMaterial,
  source: Texture,
  size: Vector2,
  axis: "x" | "y",
  edgeAware: boolean,
): void {
  const uniforms = material.uniforms;
  uniforms.occlusion.value = source;
  (uniforms.stride.value as Vector2).set(
    axis === "x" ? 1 / size.x : 0,
    axis === "y" ? 1 / size.y : 0,
  );
  uniforms.edgeAware.value = edgeAware;
}
