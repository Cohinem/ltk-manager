import { Material, RawShaderMaterial } from "three";

import { shareProgramGlobals } from "./programMaterial";

/** The pixel stage's outputs: the colour the frame takes, and the bloom the engine blurs. */
const COLOR_OUTPUT = "layout(location = 0) out vec4 SV_Target;";
const GLOW_OUTPUT = "layout(location = 1) out vec4 SV_Target1;";

/** The same two outputs with the bloom at the only location a single target draws. */
const COLOR_UNDRAWN = "vec4 SV_Target;";
const GLOW_DRAWN = "layout(location = 0) out vec4 SV_Target1;";

/**
 * `material` drawing its pixel stage's second target, the engine's bloom input, in place of
 * its colour, and null for a stage with one target.
 *
 * The glow shares `material`'s uniforms, so a write to either reaches both, and draws in its
 * blend and depth state.
 */
export function glowMaterial(material: RawShaderMaterial): RawShaderMaterial | null {
  const source = material.fragmentShader;
  if (!source.includes(COLOR_OUTPUT) || !source.includes(GLOW_OUTPUT)) return null;

  const glow = new RawShaderMaterial();
  Material.prototype.copy.call(glow, material);
  glow.glslVersion = material.glslVersion;
  glow.vertexShader = material.vertexShader;
  glow.fragmentShader = source
    .replace(COLOR_OUTPUT, COLOR_UNDRAWN)
    .replace(GLOW_OUTPUT, GLOW_DRAWN);
  glow.uniforms = material.uniforms;
  glow.uniformsGroups = material.uniformsGroups;
  glow.defaultAttributeValues = material.defaultAttributeValues;
  shareProgramGlobals(material, glow);

  return glow;
}
