import {
  AddEquation,
  BackSide,
  type BlendingDstFactor,
  type BlendingSrcFactor,
  CustomBlending,
  DoubleSide,
  DstColorFactor,
  FrontSide,
  NoBlending,
  OneFactor,
  OneMinusDstColorFactor,
  OneMinusSrcAlphaFactor,
  OneMinusSrcColorFactor,
  type ShaderMaterial,
  SrcAlphaFactor,
  SrcColorFactor,
  ZeroFactor,
} from "three";

import type { MaterialPreview, RenderState, Wrap } from "@/lib/tauri";

import { CUSTOM_FRAGMENT } from "../shaders/custom";

const FACTORS: Record<RenderState["srcFactor"], BlendingSrcFactor & BlendingDstFactor> = {
  zero: ZeroFactor,
  one: OneFactor,
  srcColor: SrcColorFactor,
  oneMinusSrcColor: OneMinusSrcColorFactor,
  dstColor: DstColorFactor,
  oneMinusDstColor: OneMinusDstColorFactor,
  srcAlpha: SrcAlphaFactor,
  oneMinusSrcAlpha: OneMinusSrcAlphaFactor,
};

const ADDRESS: Record<Wrap, number> = { repeat: 0, clamp: 1, mirror: 2, border: 3 };

/** The shared static material approximation on a particle's existing vertex program. */
export function customMaterial(
  material: ShaderMaterial,
  preview: MaterialPreview | null | undefined,
): ShaderMaterial {
  if (preview == null || preview.missing) {
    return material;
  }

  const state = preview.renderState;
  const wrap = preview.base?.wrap ?? ["repeat", "repeat"];

  material.fragmentShader = CUSTOM_FRAGMENT;
  material.defines = {
    ...material.defines,
    CUSTOM_TEXTURE: Number(preview.base !== null && material.uniforms.map.value !== null),
    CUSTOM_PREMULTIPLIED: Number(state.premultiplied),
  };
  Object.assign(material.uniforms, {
    materialTint: { value: [...(preview.tint ?? [1, 1, 1]), preview.opacity ?? 1] },
    materialRepeat: { value: preview.uvRepeat ?? [1, 1] },
    materialAddress: { value: [ADDRESS[wrap[0]], ADDRESS[wrap[1]]] },
    alphaRef: { value: preview.alphaTest ?? 0 },
  });

  material.blending = state.blending === "opaque" ? NoBlending : CustomBlending;
  material.blendSrc = FACTORS[state.srcFactor];
  material.blendDst = FACTORS[state.dstFactor];
  material.blendEquation = AddEquation;
  material.blendSrcAlpha = null;
  material.blendDstAlpha = null;
  material.transparent = state.blending !== "opaque" && !("GROUND_LAYER" in material.defines);
  material.depthTest = state.depthTest;
  material.depthWrite = state.depthWrite;
  material.side = state.doubleSided ? DoubleSide : state.inverted ? BackSide : FrontSide;

  return material;
}
