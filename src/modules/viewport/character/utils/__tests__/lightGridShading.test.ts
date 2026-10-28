import { ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { gridPbrMaterial, lightGridUniforms } from "../lightGridShading";

/** The standard material's own shaders after `material`'s patch, as three would compile them. */
function compiled(
  material: ReturnType<typeof gridPbrMaterial>,
): WebGLProgramParametersWithUniforms {
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe("gridPbrMaterial", () => {
  it("replaces each chunk it patches, so none of them is left to three's own reading", () => {
    const shader = compiled(gridPbrMaterial(lightGridUniforms()));

    expect(shader.fragmentShader).not.toContain("#include <roughnessmap_fragment>");
    expect(shader.fragmentShader).not.toContain("#include <metalnessmap_fragment>");
    expect(shader.fragmentShader).not.toContain("#include <normal_fragment_maps>");
    expect(shader.vertexShader).toContain("vLightGrid =");
  });

  it("reads roughness from red, metalness from green and occlusion from blue", () => {
    const { fragmentShader } = compiled(gridPbrMaterial(lightGridUniforms()));

    expect(fragmentShader).toContain("roughnessFactor *= rmaTexel.r;");
    expect(fragmentShader).toContain("metalnessFactor *= rmaTexel.g;");
    expect(fragmentShader).toContain("rmaOcclusion = rmaTexel.b;");
  });

  it("moves the ambient light into image-based light before three resolves it", () => {
    const { fragmentShader } = compiled(gridPbrMaterial(lightGridUniforms()));

    const ambient = fragmentShader.indexOf("iblIrradiance += irradiance;");
    expect(ambient).toBeGreaterThan(fragmentShader.indexOf("#include <lights_fragment_maps>"));
    expect(ambient).toBeLessThan(fragmentShader.indexOf("#include <lights_fragment_end>"));
    expect(
      fragmentShader.indexOf("reflectedLight.indirectSpecular *= rmaOcclusion;"),
    ).toBeGreaterThan(fragmentShader.indexOf("#include <aomap_fragment>"));
  });

  it("shares the light grid uniforms it was made with", () => {
    const uniforms = lightGridUniforms();
    const shader = compiled(gridPbrMaterial(uniforms));

    expect(shader.uniforms.lightGridCube).toBe(uniforms.cube);
    expect(shader.uniforms.lightGridOn).toBe(uniforms.on);
  });
});
