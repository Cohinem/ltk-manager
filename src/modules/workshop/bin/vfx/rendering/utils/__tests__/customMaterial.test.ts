import {
  CustomBlending,
  DoubleSide,
  ShaderMaterial,
  SrcAlphaFactor,
  OneMinusSrcAlphaFactor,
} from "three";
import { describe, expect, it } from "vitest";

import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { CUSTOM_FRAGMENT } from "../../shaders/custom";
import { premultiplyInto } from "../blend";
import { customMaterial } from "../customMaterial";
import { distorts } from "../drawKind";
import { materialPreview } from "./materialFixture";

describe("customMaterial", () => {
  it("keeps particle geometry and binds the shared static preview slots", () => {
    const material = new ShaderMaterial({
      vertexShader: "particle vertices",
      uniforms: { map: { value: null } },
    });

    const result = customMaterial(material, materialPreview());

    expect(result).toBe(material);
    expect(result.vertexShader).toBe("particle vertices");
    expect(result.fragmentShader).toBe(CUSTOM_FRAGMENT);
    expect(result.uniforms.materialTint.value).toEqual([0.25, 0.5, 1, 0.4]);
    expect(result.uniforms.materialRepeat.value).toEqual([2, 3]);
    expect(result.uniforms.alphaRef.value).toBe(0.1);
    expect(result.blending).toBe(CustomBlending);
    expect(result.blendSrc).toBe(SrcAlphaFactor);
    expect(result.blendDst).toBe(OneMinusSrcAlphaFactor);
    expect(result.side).toBe(DoubleSide);
    expect(result.depthWrite).toBe(false);
    expect(result.defines.CUSTOM_TEXTURE).toBe(0);
  });

  it("preserves the particle shader for an absent or unresolved material", () => {
    for (const preview of [null, materialPreview({ missing: true })]) {
      const material = new ShaderMaterial({ fragmentShader: "particle fragment" });

      customMaterial(material, preview);

      expect(material.fragmentShader).toBe("particle fragment");
    }
  });

  it("leaves particle alpha for the custom fragment and draws in the colour pass", () => {
    const emitter = emitterOf(0, {
      customMaterial: materialPreview(),
      distortion: { strength: 1, mode: 1, map: null },
    });
    const color = new Float32Array([1, 0.5, 0.25, 0.5]);

    premultiplyInto(emitter, color);

    expect([...color]).toEqual([1, 0.5, 0.25, 0.5]);
    expect(distorts(emitter)).toBe(false);
  });
});
