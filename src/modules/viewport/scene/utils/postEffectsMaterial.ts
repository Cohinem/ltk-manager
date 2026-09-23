import {
  type Camera,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
} from "three";

import { type AmbientOcclusion, drawsAmbientOcclusion } from "./ambientOcclusion";
import type { Fog, PostEffects } from "./postEffects";

/** How many samples one pixel's blur gathers, as many as the game's, on a golden-angle disc. */
const TAPS = 64;

/** The frame height the depth of field's `coc` is measured in. */
const COC_FRAME_HEIGHT = 1080;

const VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
#include <packing>

#define TAPS ${TAPS}
#define GOLDEN_ANGLE 2.39996323

uniform sampler2D frame;
uniform sampler2D sceneDepth;
uniform vec2 depthRange;
uniform bool orthographic;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform vec2 viewport;

uniform bool depthFogOn;
uniform vec3 depthFogColor;
uniform vec3 depthFogRamp;
uniform bool heightFogOn;
uniform vec3 heightFogColor;
uniform vec3 heightFogRamp;
uniform bool focusOn;
uniform vec3 focus;
uniform bool occlusionOn;
uniform sampler2D occlusion;
uniform float occlusionIntensity;

varying vec2 vUv;

float storedDepth(vec2 at) {
  return texture2D(sceneDepth, at).x;
}

vec3 shadedAt(vec2 at) {
  vec3 color = texture2D(frame, at).rgb;
  if (occlusionOn) color *= mix(1.0, texture2D(occlusion, at).x, occlusionIntensity);
  return color;
}

float awayAt(float depth) {
  float viewZ = orthographic
    ? orthographicDepthToViewZ(depth, depthRange.x, depthRange.y)
    : perspectiveDepthToViewZ(depth, depthRange.x, depthRange.y);
  return -viewZ;
}

/* start, end and the most it covers, as x, y and z. The ramp is capped rather than scaled,
   and a start equal to its end draws nothing. */
float ramp(float at, vec3 fog) {
  float span = fog.y - fog.x;
  if (abs(span) < 1e-3) return 0.0;
  return min(clamp((at - fog.x) / span, 0.0, 1.0), fog.z);
}

/* How blurred a distance from the camera is, 0 inside the sharp band and 1 past a ramp as
   deep as half the band on either side. */
float blurAt(float away) {
  float halfBand = focus.y * 0.5;
  float transition = max(halfBand, 1.0);
  float far = clamp((away - focus.x - halfBand) / transition, 0.0, 1.0);
  float near = clamp((focus.x - halfBand - away) / transition, 0.0, 1.0);
  return max(far, near);
}

/* Taps behind this pixel count in full, and taps in front of it count as far as they are
   blurred themselves, so a sharp foreground keeps its edge over a blurred background. */
vec3 blurred(vec2 at, float depth, float away, vec3 color) {
  float amount = blurAt(away);
  if (amount <= 0.0) return color;
  vec2 reach = amount * focus.z * (viewport.y / ${COC_FRAME_HEIGHT.toFixed(1)}) / viewport;
  vec3 sum = color;
  float weight = 1.0;
  for (int i = 0; i < TAPS; i++) {
    float radius = sqrt((float(i) + 0.5) / float(TAPS));
    float angle = float(i) * GOLDEN_ANGLE;
    vec2 tap = at + vec2(cos(angle), sin(angle)) * radius * reach;
    float tapDepth = storedDepth(tap);
    float counts = depth < tapDepth ? 1.0 : blurAt(awayAt(tapDepth));
    sum += shadedAt(tap) * counts;
    weight += counts;
  }
  return sum / weight;
}

void main() {
  float depth = storedDepth(vUv);
  vec3 color = shadedAt(vUv);

  if (focusOn) color = blurred(vUv, depth, awayAt(depth), color);
  if (depth < 1.0 && (heightFogOn || depthFogOn)) {
    vec4 view = projectionInverse * vec4(vec3(vUv, depth) * 2.0 - 1.0, 1.0);
    vec3 world = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
    if (heightFogOn) color = mix(color, heightFogColor, ramp(world.y, heightFogRamp));
    if (depthFogOn) {
      float away = length(world - cameraWorld[3].xyz);
      color = mix(color, depthFogColor, ramp(away, depthFogRamp));
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * The screen pass drawing a scene's post effects over its frame, off the scene's depth.
 *
 * Ported from the game's `gamma/postfog.ps` and `gamma/dof.ps`. Each fog is capped at its
 * most rather than scaled by it and skips the sky. The height fog ramps on each pixel's
 * world height, then the depth fog on its straight-line distance from the camera. The frame
 * is the canvas's sRGB bytes and each colour is a map's own bytes, so they mix without a
 * decode. Where the band edges and the blur's reach come from is set outside the shader,
 * so those two are the preview's reading. The occlusion darkens the frame first, which is
 * the preview's reading of where the game applies it, then the blur runs before both fogs.
 */
export function postEffectsMaterial(
  frame: Texture,
  depth: Texture,
  occlusion: Texture,
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      frame: { value: frame },
      sceneDepth: { value: depth },
      depthRange: { value: new Vector2(1, 1) },
      orthographic: { value: false },
      projectionInverse: { value: new Matrix4() },
      cameraWorld: { value: new Matrix4() },
      viewport: { value: new Vector2(1, 1) },
      depthFogOn: { value: false },
      depthFogColor: { value: new Vector3() },
      depthFogRamp: { value: new Vector3() },
      heightFogOn: { value: false },
      heightFogColor: { value: new Vector3() },
      heightFogRamp: { value: new Vector3() },
      focusOn: { value: false },
      focus: { value: new Vector3() },
      occlusionOn: { value: false },
      occlusion: { value: occlusion },
      occlusionIntensity: { value: 1 },
    },
  });
}

/**
 * Point `material`'s uniforms at `effects` and `occlusion`, seen through `camera` on a
 * `viewport`-sized frame.
 */
export function writePostEffects(
  material: ShaderMaterial,
  effects: PostEffects,
  occlusion: AmbientOcclusion,
  camera: Camera,
  viewport: Vector2,
): void {
  const uniforms = material.uniforms;
  if (camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera) {
    (uniforms.depthRange.value as Vector2).set(camera.near, camera.far);
  }
  uniforms.orthographic.value = camera instanceof OrthographicCamera;
  (uniforms.projectionInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
  (uniforms.cameraWorld.value as Matrix4).copy(camera.matrixWorld);
  (uniforms.viewport.value as Vector2).copy(viewport);

  writeFog(uniforms.depthFogOn, uniforms.depthFogColor, uniforms.depthFogRamp, effects.depthFog);
  writeFog(
    uniforms.heightFogOn,
    uniforms.heightFogColor,
    uniforms.heightFogRamp,
    effects.heightFog,
  );
  const focus = effects.depthOfField;
  uniforms.focusOn.value = focus.enabled && focus.coc > 0;
  (uniforms.focus.value as Vector3).set(focus.focalDistance, focus.inFocusWidth, focus.coc);
  uniforms.occlusionOn.value = drawsAmbientOcclusion(occlusion);
  uniforms.occlusionIntensity.value = occlusion.intensity;
}

interface Uniform {
  value: unknown;
}

function writeFog(on: Uniform, color: Uniform, ramp: Uniform, fog: Fog): void {
  on.value = fog.enabled && fog.maxIntensity > 0;
  (color.value as Vector3).set(...fog.color);
  (ramp.value as Vector3).set(fog.start, fog.end, fog.maxIntensity);
}
