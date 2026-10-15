import {
  type Camera,
  Color,
  DepthTexture,
  Matrix4,
  OrthographicCamera,
  Plane,
  Quaternion,
  Ray,
  type Scene,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
} from "three";

import { AXIS_SIGN, GROUND_LEVEL } from "../../shared/utils/space";
import type { SunLight } from "./sunLight";

/** The shadow map's side in texels, the client's at shadow quality High and above. */
export const SUN_SHADOW_SIZE = 2048;

/** The width and depth of ground the shadow map covers, `FreeCameraShadowExtentXz`'s default. */
export const SUN_SHADOW_EXTENT = 3000;

/** How far the shadow camera stands back from the point it centres on, along the sun. */
const SUN_SHADOW_REACH = 5000;

/** The depth a receiver is moved toward the sun before the test, in units of the map's depth. */
const SUN_SHADOW_BIAS = 5 / (SUN_SHADOW_REACH * 2);

/** The uniforms a receiver reads, shared by every receiver of one scene. */
export interface SunShadowUniforms {
  readonly sunShadowMap: { value: DepthTexture };
  /** World space to the map's texture coordinates and depth, each 0 to 1. */
  readonly sunShadowMatrix: { value: Matrix4 };
  /** The map holds this frame's casters. A receiver reads no shadow while it is false. */
  readonly sunShadowOn: { value: boolean };
  /** `SHADOW_COLOR`: what a shadowed receiver keeps of its colour. */
  readonly sunShadowColor: { value: Color };
}

/** One scene's sun shadow map, the camera that draws it and what its receivers read. */
export interface SunShadow {
  readonly target: WebGLRenderTarget;
  readonly camera: OrthographicCamera;
  readonly uniforms: SunShadowUniforms;
  /** Unit length, pointing at the sun in the scene's space. */
  readonly toSun: Vector3;
}

const SHADOWS = new WeakMap<Scene, SunShadow>();

/** Returns the sun shadow of `scene`, and creates it on the first call. */
export function sunShadowOf(scene: Scene): SunShadow {
  const held = SHADOWS.get(scene);
  if (held !== undefined) return held;

  const depth = new DepthTexture(SUN_SHADOW_SIZE, SUN_SHADOW_SIZE, UnsignedIntType);
  const target = new WebGLRenderTarget(SUN_SHADOW_SIZE, SUN_SHADOW_SIZE, { depthTexture: depth });
  const half = SUN_SHADOW_EXTENT / 2;
  const camera = new OrthographicCamera(-half, half, half, -half, 1, SUN_SHADOW_REACH * 2);
  camera.layers.enableAll();

  const made: SunShadow = {
    target,
    camera,
    uniforms: {
      sunShadowMap: { value: depth },
      sunShadowMatrix: { value: new Matrix4() },
      sunShadowOn: { value: false },
      sunShadowColor: { value: new Color(1, 1, 1) },
    },
    toSun: new Vector3(0, 1, 0),
  };
  SHADOWS.set(scene, made);
  return made;
}

/** Releases the shadow map of `scene`, if it has one. */
export function releaseSunShadow(scene: Scene): void {
  const held = SHADOWS.get(scene);
  if (held === undefined) return;

  held.target.dispose();
  SHADOWS.delete(scene);
}

/**
 * Writes the direction and the shadow colour of `light` into `shadow`.
 *
 * The shadow colour is the sky's share, so a shadowed receiver keeps the ambient light and
 * loses the sun's, and an unshadowed one sums to its whole colour.
 */
export function lightSunShadow(shadow: SunShadow, light: SunLight): void {
  const [x, y, z] = light.direction;
  shadow.toSun.set(x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]).normalize();

  const [r, g, b] = light.sky;
  const share = Math.min(Math.max(light.ambient, 0), 1);
  shadow.uniforms.sunShadowColor.value.setRGB(r * share, g * share, b * share);
}

const GROUND = new Plane(new Vector3(0, 1, 0), -GROUND_LEVEL);
const LOOK = new Ray();
const FOCUS = new Vector3();
const TURN = new Quaternion();
const UP_Z = new Vector3(0, 0, 1);
const UP_Y = new Vector3(0, 1, 0);
/** Clip space to texture space: each axis from -1 to 1 onto 0 to 1. */
const TO_TEXTURE = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/**
 * Points the shadow camera of `shadow` down the sun at the ground that `eye` looks at.
 *
 * The client centres the map on the scene camera's ground footprint and snaps it to the
 * texel grid, so a moving camera does not make the shadow edges crawl. If the eye looks
 * away from the ground, the map centres under the eye.
 */
export function aimSunShadow(shadow: SunShadow, eye: Camera): void {
  eye.updateMatrixWorld();
  LOOK.origin.setFromMatrixPosition(eye.matrixWorld);
  eye.getWorldDirection(LOOK.direction);
  if (LOOK.intersectPlane(GROUND, FOCUS) === null) {
    FOCUS.set(LOOK.origin.x, GROUND_LEVEL, LOOK.origin.z);
  }

  const { camera, toSun } = shadow;
  camera.up.copy(Math.abs(toSun.z) > 0.99 ? UP_Y : UP_Z);
  camera.position.copy(toSun);
  camera.lookAt(0, 0, 0);

  /* The focus snaps in the light's own frame, whose rotation depends on the sun alone. */
  const texel = SUN_SHADOW_EXTENT / SUN_SHADOW_SIZE;
  FOCUS.applyQuaternion(TURN.copy(camera.quaternion).invert());
  FOCUS.set(Math.round(FOCUS.x / texel) * texel, Math.round(FOCUS.y / texel) * texel, FOCUS.z);
  FOCUS.applyQuaternion(camera.quaternion);

  camera.position.copy(toSun).multiplyScalar(SUN_SHADOW_REACH).add(FOCUS);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  shadow.uniforms.sunShadowMatrix.value
    .copy(TO_TEXTURE)
    .multiply(camera.projectionMatrix)
    .multiply(camera.matrixWorldInverse);
}

/**
 * The receiver's declarations and `sunShadowed`, which a lit fragment multiplies its colour by.
 *
 * The vertex stage writes `vSunWorld`, the fragment's world position.
 */
export const SUN_SHADOW_RECEIVER = /* glsl */ `
uniform sampler2D sunShadowMap;
uniform mat4 sunShadowMatrix;
uniform bool sunShadowOn;
uniform vec3 sunShadowColor;

varying vec3 vSunWorld;

/* DefaultEnv_Flat's one tap: albedo * (SHADOW_COLOR + visible * SHADOW_COLOR_COMPLEMENT). */
vec3 sunShadowed(vec3 albedo) {
  if (!sunShadowOn) return albedo;

  vec4 at = sunShadowMatrix * vec4(vSunWorld, 1.0);
  vec3 onMap = at.xyz / at.w;
  if (any(lessThan(onMap, vec3(0.0))) || any(greaterThan(onMap, vec3(1.0)))) return albedo;

  float visible = onMap.z - ${SUN_SHADOW_BIAS.toFixed(6)} <= texture2D(sunShadowMap, onMap.xy).r ? 1.0 : 0.0;
  return albedo * (sunShadowColor + visible * (1.0 - sunShadowColor));
}
`;
