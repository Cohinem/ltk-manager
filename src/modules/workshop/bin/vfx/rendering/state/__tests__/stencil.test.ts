import { EqualStencilFunc, Material, ReplaceStencilOp, Scene } from "three";
import { describe, expect, it } from "vitest";

import { STENCIL_MODE } from "../../../engine/model/enums";
import type { StencilUse } from "../../utils/stencil";
import { claimStencil } from "../stencil";

function stencilUse(mode: StencilUse["mode"], ref: number): StencilUse {
  return { mode, ref, id: null };
}

describe("claimStencil", () => {
  it("writes a tester's state when a writer joins the scene and clears it when the writer leaves", () => {
    const scene = new Scene();
    const tester = new Material();
    const writer = new Material();
    claimStencil(scene, {
      use: stencilUse(STENCIL_MODE.testEqual, 4),
      live: true,
      materials: [tester],
    });

    expect(tester.stencilWrite).toBe(false);

    const release = claimStencil(scene, {
      use: stencilUse(STENCIL_MODE.writeMask, 4),
      live: true,
      materials: [writer],
    });

    expect([tester.stencilWrite, tester.stencilFunc, tester.stencilRef]).toEqual([
      true,
      EqualStencilFunc,
      4,
    ]);
    expect(writer.stencilZPass).toBe(ReplaceStencilOp);

    release();

    expect(tester.stencilWrite).toBe(false);
    expect(writer.stencilWrite).toBe(false);
  });

  it("keeps the claims of two scenes apart", () => {
    const tester = new Material();
    claimStencil(new Scene(), {
      use: stencilUse(STENCIL_MODE.testEqual, 4),
      live: true,
      materials: [tester],
    });
    claimStencil(new Scene(), {
      use: stencilUse(STENCIL_MODE.writeMask, 4),
      live: true,
      materials: [new Material()],
    });

    expect(tester.stencilWrite).toBe(false);
  });
});
