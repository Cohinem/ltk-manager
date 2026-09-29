import {
  AddEquation,
  CustomBlending,
  DoubleSide,
  GLSL3,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RawShaderMaterial,
  SrcAlphaFactor,
  type Texture,
} from "three";

import {
  bindProgramTexture,
  createInlinedProgramMaterial,
  type ReadyProgram,
  writeProgramMember,
} from "@/modules/viewport";

import type { TextCommand } from "../../engine/commands/types";
import type { Screen } from "../../engine/layout/solve";

const GLYPH_TEXTURE = "GLYPH_TEXTURE__TX";
const OUTLINE_TEXTURE = "OUTLINE_TEXTURE__TX";
const FILL_TEXTURE = "FILL_TEXTURE__TX";
const FONT_MATRIX = "FONT_MATRIX";
const FONT_COLOR = "FONT_COLOR";

/** What one text draw samples. */
export interface FontTextures {
  /** The glyph page's coverage, or an icon's texture. */
  readonly glyph: Texture;
  readonly outline: Texture;
  readonly fill: Texture;
}

/**
 * A material for one text draw: `program` with `FONT_MATRIX` taking screen pixels onto clip
 * space, `FONT_COLOR` written and the three textures bound, blended as the client blends text
 * per section 2.3 of docs/plans/atlas-renderer.md. Without a program, a hand-written stand-in
 * draws the same pass.
 */
export function fontMaterial(
  command: TextCommand,
  program: ReadyProgram | null,
  screen: Screen,
  textures: FontTextures,
): RawShaderMaterial {
  const material =
    program === null ? fallbackMaterial(command.shader) : translated(command.shader, program);
  const write = (name: string, value: ArrayLike<number>) => {
    if (program === null) material.uniforms[name] = { value: Array.from(value) };
    else writeProgramMember(material, name, value);
  };
  const bind = (name: string, texture: Texture) => {
    if (program === null) material.uniforms[name] = { value: texture };
    else bindProgramTexture(material, name, texture);
  };

  write(FONT_MATRIX, [
    2 / screen.width,
    0,
    0,
    -1,
    0,
    -2 / screen.height,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]);
  write(FONT_COLOR, command.color);
  bind(GLYPH_TEXTURE, textures.glyph);
  bind(OUTLINE_TEXTURE, textures.outline);
  bind(FILL_TEXTURE, textures.fill);

  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.side = DoubleSide;
  material.blending = CustomBlending;
  material.blendEquation = AddEquation;
  material.blendSrc = SrcAlphaFactor;
  material.blendDst = OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = OneFactor;
  material.blendDstAlpha = OneFactor;
  return material;
}

function translated(shader: TextCommand["shader"], program: ReadyProgram): RawShaderMaterial {
  return createInlinedProgramMaterial(program, `ui:${shader}`);
}

const FALLBACK_VERTEX = `
uniform float FONT_MATRIX[16];
in vec2 a_POSITION;
in vec4 a_COLOR;
in vec2 a_TEXCOORD;
in vec2 a_TEXCOORD1;
out vec4 v_color;
out vec2 v_uv;
out vec2 v_fill;

void main() {
  gl_Position = vec4(
    a_POSITION.x * FONT_MATRIX[0] + FONT_MATRIX[3],
    a_POSITION.y * FONT_MATRIX[5] + FONT_MATRIX[7],
    0.0,
    1.0
  );
  v_color = a_COLOR.zyxw;
  v_uv = a_TEXCOORD;
  v_fill = a_TEXCOORD1;
}
`;

const FALLBACK_FRAGMENT = `
precision highp float;
uniform sampler2D ${GLYPH_TEXTURE};
uniform sampler2D ${OUTLINE_TEXTURE};
uniform sampler2D ${FILL_TEXTURE};
uniform vec4 ${FONT_COLOR};
uniform int u_pass;
in vec4 v_color;
in vec2 v_uv;
in vec2 v_fill;
out vec4 fragment;

void main() {
  if (u_pass == 1) {
    fragment = vec4(${FONT_COLOR}.rgb, texture(${OUTLINE_TEXTURE}, v_uv).r * ${FONT_COLOR}.a);
  } else if (u_pass == 2) {
    fragment = texture(${GLYPH_TEXTURE}, v_uv) * ${FONT_COLOR};
  } else {
    vec3 fill = texture(${FILL_TEXTURE}, v_fill).rgb * v_color.rgb * ${FONT_COLOR}.rgb;
    fragment = vec4(fill, texture(${GLYPH_TEXTURE}, v_uv).r * ${FONT_COLOR}.a);
  }
}
`;

const PASS: Readonly<Record<TextCommand["shader"], number>> = {
  font: 0,
  fontOutline: 1,
  fontIcon: 2,
};

/** `Font.ps`, `FontWithOutline.ps` and `FontIcon.ps` written by hand, as the translations read. */
function fallbackMaterial(shader: TextCommand["shader"]): RawShaderMaterial {
  return new RawShaderMaterial({
    name: `ui:${shader}:fallback`,
    glslVersion: GLSL3,
    vertexShader: FALLBACK_VERTEX,
    fragmentShader: FALLBACK_FRAGMENT,
    uniforms: { u_pass: { value: PASS[shader] } },
  });
}
