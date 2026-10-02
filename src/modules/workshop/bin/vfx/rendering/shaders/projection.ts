import { AXIS_SIGN, GROUND_LEVEL } from "@/modules/viewport";

import { FETCH, PICK, WIRE } from "./quad";

/**
 * A planar projection's footprint laid on the ground, after `UNLIT_DECAL_VS`.
 *
 * Every lane is the engine's: the particle's centre, the footprint's half-extents and the
 * turn of `DECAL_WORLD_TO_UV_MATRIX`, so the corner and the fade are placed there and the
 * mirror comes last. The fade is the vertex shader's `DECAL_PROJECTION_Y_RANGE` term, the
 * surface's height against the particle's. "Planar projection" in
 * docs/plans/vfx-particle-renderer.md.
 */
export const PROJECTION_VERTEX = /* glsl */ `
const float GROUND_LEVEL = ${GROUND_LEVEL.toFixed(1)};
const vec3 AXIS = vec3(${AXIS_SIGN.map((sign) => sign.toFixed(1)).join(", ")});

attribute vec2 corner;
attribute vec3 center;
attribute vec3 footprint;
attribute vec4 color;
attribute vec2 lookup;

uniform vec2 heightFade;

varying vec2 vUv;
varying vec4 vColor;
varying vec2 vLookup;
varying float vFade;

void main() {
  vec2 local = corner * 2.0 * footprint.xy;
  float c = cos(footprint.z);
  float s = sin(footprint.z);
  vec2 offset = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec3 engine = vec3(center.x + offset.x, GROUND_LEVEL, center.z + offset.y);

  float gap = abs(GROUND_LEVEL - center.y);
  vFade = gap <= heightFade.x ? 1.0 : 1.0 - (gap - heightFade.x) / max(heightFade.y, 1e-6);

  vUv = vec2(corner.x + 0.5, 0.5 - corner.y);
  vColor = color;
  vLookup = lookup;
  gl_Position = projectionMatrix * viewMatrix * vec4(engine * AXIS, 1.0);
}
`;

/**
 * `UNLIT_DECAL_PS`: the texel times the ramp at `COLOR_UV` times `MODULATE_COLOR`, its alpha
 * faded by height.
 *
 * The fog of war is the one term left out, the preview having none.
 */
export const PROJECTION_FRAGMENT = /* glsl */ `
${WIRE}
${PICK}
uniform sampler2D map;
uniform int address;
uniform sampler2D mapRamp;
uniform float alphaRef;

varying vec2 vUv;
varying vec4 vColor;
varying vec2 vLookup;
varying float vFade;

${FETCH}

void main() {
#ifdef WIREFRAME
  gl_FragColor = wireColor;
  return;
#endif
  vec4 texel = vec4(1.0);
#ifdef HAS_MAP
  texel = fetch(map, vUv, vec4(0.0), vec2(1.0), address);
#endif
#ifdef PICK
  if (texel.a < PICK_ALPHA) discard;
  gl_FragColor = pickId;
  return;
#endif
#ifdef HAS_RAMP
  texel *= texture2D(mapRamp, vLookup);
#endif
  vec4 lit = texel * vColor;
  lit.a *= max(vFade, 0.0);
  if (lit.a < alphaRef) discard;
  gl_FragColor = lit;
}
`;
