import {
  AddEquation,
  CustomBlending,
  DoubleSide,
  GLSL3,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RawShaderMaterial,
  type Texture,
} from "three";

import type { UiShader } from "@/lib/tauri";
import {
  applyPassState,
  bindProgramTexture,
  bindProgramTextures,
  createInlinedProgramMaterial,
  type ReadyProgram,
  type SubmeshProgram,
  writeProgramGlobals,
  writeProgramMember,
} from "@/modules/viewport";

import type { UiBlend } from "../../engine/commands/types";

/** The texture every UI program samples, by the bytecode's name. */
const PRIMARY_TEXTURE = "UI_PRIMARY_TEXTURE_SharedTexture";

/** The scene's tint in `rgb` and its opacity in `w`, `UIPerPassPS`. */
export const UI_COLOR = "UI_COLOR";

/** The seconds a material's scroll and pulse read, `PerFramePixelCB` and `PerFrameVertexCB`. */
export const UI_TIME = "TIME";

/** The scene's transform times the base matrix, `UIPerPassVS`. */
const UI_ELEMENT_MATRIX = "UI_ELEMENT_MATRIX";

/**
 * `UI_ELEMENT_MATRIX` with the identity scene transform: the client's base matrix taking 0 to 1
 * onto clip space with y turned over, per section 2.1 of docs/plans/atlas-renderer.md, in the
 * transposed rows a translated stage reads.
 */
const BASE_MATRIX = [2, 0, 0, -1, 0, -2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1] as const;

/** A material for one draw, and how a draw writes the members and the texture it reads. */
export interface UiMaterial {
  readonly material: RawShaderMaterial;
  /** Whether it is the game's own program rather than the fallback. */
  readonly translated: boolean;
  member(name: string, value: ArrayLike<number>): void;
  texture(texture: Texture): void;
}

/**
 * A material for `shader`, with the scene's colour and the base matrix written and `blend`
 * set. `program` is the translated pair, and null draws the fallback until it arrives or where
 * it failed.
 */
export function uiMaterial(
  shader: UiShader,
  program: ReadyProgram | null,
  blend: UiBlend,
): UiMaterial {
  const made = program === null ? fallbackMaterial() : translatedMaterial(shader, program);
  applyBlend(made.material, blend);
  made.member(UI_ELEMENT_MATRIX, BASE_MATRIX);
  made.member(UI_COLOR, [1, 1, 1, 1]);
  return made;
}

/**
 * The `StaticMaterialDef` an icon or a custom material effect draws with: its first pass that
 * translated, and whether it moves.
 */
export interface ViewMaterial {
  readonly pass: SubmeshProgram;
  readonly animated: boolean;
}

/**
 * A material drawing an icon or a custom material effect through its `StaticMaterialDef`, per
 * section 6 of
 * docs/plans/atlas-renderer.md: the pass's program with its constants, textures and blend, and the
 * UI blocks and the sprite written as `uiMaterial` writes them. Every shipped UI material blends
 * premultiplied, as the frame does.
 */
export function viewMaterial(icon: ViewMaterial): UiMaterial {
  const { pass } = icon;
  const material = createInlinedProgramMaterial(pass.program, `ui:material:${pass.material}`);
  writeProgramGlobals(material, pass, pass.pass);
  bindProgramTextures(material, pass);
  applyPassState(material, pass.pass.state);
  /* Transparent like every UI draw, so the draw order is the list's. */
  material.transparent = true;

  const made: UiMaterial = {
    material,
    translated: true,
    member: (name, value) => writeProgramMember(material, name, value),
    texture: (texture) => bindProgramTexture(material, PRIMARY_TEXTURE, texture),
  };
  made.member(UI_ELEMENT_MATRIX, BASE_MATRIX);
  made.member(UI_COLOR, [1, 1, 1, 1]);
  return made;
}

function translatedMaterial(shader: UiShader, program: ReadyProgram): UiMaterial {
  const material = createInlinedProgramMaterial(program, `ui:${shader}`);
  return {
    material,
    translated: true,
    member: (name, value) => writeProgramMember(material, name, value),
    texture: (texture) => bindProgramTexture(material, PRIMARY_TEXTURE, texture),
  };
}

/** Section 2.3's blend states. Every material is transparent so the draw order is the list's. */
function applyBlend(material: RawShaderMaterial, blend: UiBlend): void {
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.side = DoubleSide;
  if (blend !== "premultiplied") {
    material.blending = NoBlending;
    return;
  }

  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = OneFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneMinusSrcAlphaFactor;
}

const FALLBACK_VERTEX = `
in vec2 a_POSITION;
in vec4 a_COLOR;
in vec4 a_TEXCOORD;
out vec4 v_color;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_POSITION.x * 2.0 - 1.0, 1.0 - a_POSITION.y * 2.0, 0.0, 1.0);
  v_color = a_COLOR.zyxw;
  v_uv = a_TEXCOORD.xy;
}
`;

const FALLBACK_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
uniform vec4 u_color;
in vec4 v_color;
in vec2 v_uv;
out vec4 fragment;

void main() {
  vec4 texel = texture(u_texture, v_uv);
  float alpha = texel.a * v_color.a;
  fragment = vec4(alpha * texel.rgb * v_color.rgb * u_color.rgb * u_color.a, alpha * u_color.a);
}
`;

/** `UI.vs` with `UI_Alpha.ps` written by hand, drawn where a translated program is missing. */
function fallbackMaterial(): UiMaterial {
  const material = new RawShaderMaterial({
    name: "ui:fallback",
    glslVersion: GLSL3,
    vertexShader: FALLBACK_VERTEX,
    fragmentShader: FALLBACK_FRAGMENT,
    uniforms: { u_texture: { value: null }, u_color: { value: [1, 1, 1, 1] } },
  });
  return {
    material,
    translated: false,
    member: (name, value) => {
      if (name === UI_COLOR) material.uniforms.u_color = { value: Array.from(value) };
    },
    texture: (texture) => {
      material.uniforms.u_texture = { value: texture };
    },
  };
}
