import { AdditiveBlending, DoubleSide, GLSL3, RawShaderMaterial } from "three";
import { describe, expect, it } from "vitest";

import { glowMaterial } from "../glowMaterial";

const TWO_TARGETS = [
  "layout(location = 0) out vec4 SV_Target;",
  "layout(location = 1) out vec4 SV_Target1;",
  "void main() { SV_Target = vec4(1.0); SV_Target1 = vec4(0.5); }",
].join("\n");

function program(fragmentShader: string): RawShaderMaterial {
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: "void main() {}",
    fragmentShader,
    uniforms: { tint: { value: 1 } },
  });
  material.blending = AdditiveBlending;
  material.side = DoubleSide;
  material.depthWrite = false;
  return material;
}

describe("glowMaterial", () => {
  it("draws the second target at location 0 and keeps the colour as a local", () => {
    const glow = glowMaterial(program(TWO_TARGETS));

    expect(glow?.fragmentShader).toContain("layout(location = 0) out vec4 SV_Target1;");
    expect(glow?.fragmentShader).toMatch(/^vec4 SV_Target;$/m);
    expect(glow?.fragmentShader).not.toContain("location = 1");
  });

  it("shares the uniforms and keeps the blend and depth state", () => {
    const material = program(TWO_TARGETS);
    const glow = glowMaterial(material);

    expect(glow?.uniforms).toBe(material.uniforms);
    expect(glow?.blending).toBe(AdditiveBlending);
    expect(glow?.side).toBe(DoubleSide);
    expect(glow?.depthWrite).toBe(false);
    expect(glow?.glslVersion).toBe(GLSL3);
  });

  it("has no glow for a stage with one target", () => {
    const glow = glowMaterial(program("layout(location = 0) out vec4 SV_Target;\nvoid main() {}"));

    expect(glow).toBeNull();
  });
});
