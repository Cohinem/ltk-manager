import { WIRE } from "./quad";

/** The shared material preview's base sampler, tint and opacity, without game shader graphs. */
export const CUSTOM_FRAGMENT = /* glsl */ `
${WIRE}
uniform sampler2D map;
uniform vec4 materialTint;
uniform vec2 materialRepeat;
uniform vec2 materialAddress;
uniform float alphaRef;

varying vec2 vUv;
varying vec4 vColor;

float addressed(float value, float mode) {
  if (mode == 0.0) return fract(value);
  if (mode == 2.0) return 1.0 - abs(mod(value, 2.0) - 1.0);
  return clamp(value, 0.0, 1.0);
}

void main() {
#ifdef WIREFRAME
  gl_FragColor = wireColor;
  return;
#endif
  vec4 texel = vec4(1.0);
#if CUSTOM_TEXTURE == 1
  vec2 uv = vUv * materialRepeat;
  bool outsideU = materialAddress.x == 3.0 && (uv.x < 0.0 || uv.x > 1.0);
  bool outsideV = materialAddress.y == 3.0 && (uv.y < 0.0 || uv.y > 1.0);
  texel = texture2D(map, vec2(addressed(uv.x, materialAddress.x), addressed(uv.y, materialAddress.y)));
  if (outsideU || outsideV) texel = vec4(0.0);
#endif
  vec4 color = texel * vColor * materialTint;
  if (color.a < alphaRef) discard;
#if CUSTOM_PREMULTIPLIED == 1
  color.rgb *= color.a;
#endif
  gl_FragColor = color;
}
`;
