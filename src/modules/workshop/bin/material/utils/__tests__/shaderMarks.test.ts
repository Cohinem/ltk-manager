import { describe, expect, it } from "vitest";

import type { BlockMember, ShaderProgram, Sidecar, StageProgram } from "@/lib/tauri";

import { shaderMarks } from "../shaderMarks";

function member(name: string, used: boolean): BlockMember {
  return { name, offset: 0, size: 16, used, scalar: "float", rows: 1, columns: 4 } as BlockMember;
}

function stage(sidecar: Sidecar): StageProgram {
  return { id: 0, glsl: "", sidecar, cached: false };
}

const PIXEL: Sidecar = {
  blocks: [
    {
      name: "$Globals",
      glslName: "Globals_ps",
      size: 64,
      members: [member("TintColor", true), member("Bloom_Intensity", false), member("Alpha", true)],
    },
  ],
  textures: [{ name: "Diffuse_Texture__TX", dimension: "texture2d", samplers: [] }],
  attributes: [],
} as unknown as Sidecar;

const EMPTY: Sidecar = { blocks: [], textures: [], attributes: [] };

/** A read of one pass whose pixel stage is `PIXEL`, with the parameters and textures given. */
function read(
  params: { name: string; source: "shaderDefault" | "material" }[],
  textures: { name: string; source: "shaderDefault" | "material" }[],
  declared: string[],
): ShaderProgram {
  return {
    program: {
      hash: "0x00000001",
      name: null,
      animated: false,
      kind: "skinnedMesh",
      warnings: [],
      passes: [
        {
          pass: {
            shader: "Shaders/SkinnedMesh/Diffuse_Bloom",
            defines: [],
            runtimeSwitches: [],
            textures: textures.map((each) => ({ ...each, texture: null, sampler: null })),
            params: params.map((each) => ({ ...each, value: [0, 0, 0, 0] })),
            state: null,
            schema: null,
          },
          program: { kind: "ready", defines: [], vertex: stage(EMPTY), pixel: stage(PIXEL) },
        },
      ],
    },
    declared: declared.map((name) => ({ name, values: ["0", "1"] })),
  } as unknown as ShaderProgram;
}

describe("shaderMarks", () => {
  it("marks a parameter that the permutation does not read, and one that the material sets", () => {
    const marks = shaderMarks(
      read(
        [
          { name: "TintColor", source: "shaderDefault" },
          { name: "Bloom_Intensity", source: "shaderDefault" },
          { name: "Alpha", source: "material" },
          { name: "Gone", source: "shaderDefault" },
        ],
        [],
        [],
      ),
      [],
    );

    expect([...marks.params]).toEqual([
      ["Bloom_Intensity", "unread"],
      ["Alpha", "material"],
      ["Gone", "unread"],
    ]);
  });

  it("marks a texture that has no binding, and one that the material sets", () => {
    const marks = shaderMarks(
      read(
        [],
        [
          { name: "Diffuse_Texture", source: "material" },
          { name: "Mask_Texture", source: "shaderDefault" },
        ],
        [],
      ),
      [],
    );

    expect([...marks.textures]).toEqual([
      ["Diffuse_Texture", "material"],
      ["Mask_Texture", "unread"],
    ]);
  });

  it("marks a compile-time switch that the TOCs do not declare", () => {
    const marks = shaderMarks(read([], [], ["USE_RIM"]), [
      { name: "USE_RIM", onByDefault: true, runtime: false },
      { name: "USE_GLOW", onByDefault: false, runtime: false },
    ]);

    expect([...marks.switches]).toEqual([["USE_GLOW", "absent"]]);
  });
});
