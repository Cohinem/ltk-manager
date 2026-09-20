import {
  AdditiveBlending,
  BackSide,
  CustomBlending,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  NormalBlending,
  OneMinusSrcAlphaFactor,
  OneMinusSrcColorFactor,
  SrcAlphaFactor,
  ZeroFactor,
} from "three";
import { describe, expect, it } from "vitest";

import type { RenderState } from "@/lib/tauri";

import { applyRenderState, sideOf } from "../renderState";

function state(over: Partial<RenderState> = {}): RenderState {
  return {
    blending: "opaque",
    srcFactor: "one",
    dstFactor: "zero",
    premultiplied: false,
    cutout: false,
    doubleSided: false,
    inverted: false,
    depthWrite: true,
    depthTest: true,
    ...over,
  };
}

function applied(over: Partial<RenderState> = {}): MeshLambertMaterial {
  const material = new MeshLambertMaterial();
  applyRenderState(material, state(over));
  return material;
}

describe("applyRenderState", () => {
  it("keeps an opaque pass out of the transparent queue", () => {
    const material = applied();

    expect(material.transparent).toBe(false);
    expect(material.blending).toBe(NormalBlending);
  });

  it("puts a blended pass in the transparent queue", () => {
    expect(applied({ blending: "normal" }).transparent).toBe(true);
  });

  it("draws an additive pass additively", () => {
    const material = applied({ blending: "additive" });

    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(AdditiveBlending);
  });

  /* The whole point of the class: a cutout clips rather than blends, so the depth buffer
     resolves it and the backdrop owes no sort. */
  it("keeps a cutout out of the transparent queue although it blends", () => {
    expect(applied({ blending: "normal", cutout: true }).transparent).toBe(false);
  });

  it("modulates by one minus the source colour", () => {
    const material = applied({ blending: "modulate" });

    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(CustomBlending);
    expect(material.blendSrc).toBe(OneMinusSrcColorFactor);
    expect(material.blendDst).toBe(ZeroFactor);
  });

  /* A stock material is reused between bindings, so a field the last one set has to be
     written rather than left. */
  it("takes the modulate factors back off a material that stops modulating", () => {
    const material = new MeshLambertMaterial();
    applyRenderState(material, state({ blending: "modulate" }));
    applyRenderState(material, state({ blending: "normal" }));

    expect(material.blendSrc).toBe(SrcAlphaFactor);
    expect(material.blendDst).toBe(OneMinusSrcAlphaFactor);
  });

  it("carries the depth bits and the premultiply as the pass states them", () => {
    const material = applied({ premultiplied: true, depthWrite: false, depthTest: false });

    expect(material.premultipliedAlpha).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(false);
  });
});

describe("sideOf", () => {
  it("keeps the front face by default", () => {
    expect(sideOf(state())).toBe(FrontSide);
  });

  it("draws both faces where the pass culls neither", () => {
    expect(sideOf(state({ doubleSided: true }))).toBe(DoubleSide);
  });

  it("keeps the back face where the pass culls the engine's own winding", () => {
    expect(sideOf(state({ inverted: true }))).toBe(BackSide);
  });
});
