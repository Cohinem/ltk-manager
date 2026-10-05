import { describe, expect, it } from "vitest";

import {
  QUAD_TYPE,
  type QuadType,
  SOFT_TARGET,
  type SoftTarget,
  UV_MODE,
  type UvMode,
} from "../../../engine/model/enums";
import type { SoftModel } from "../../../engine/model/model";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { fadeOf, fades, softControl, softParams } from "../softParticle";

/**
 * The fade `quad_ps` and `mesh_ps` run off `cSoftParticleParams`, at a gap between the
 * scene's depth and the fragment's, as the engine computes it.
 */
function fadeAt(gap: number, [x, y, z, w]: readonly number[]): number {
  const eased = (t: number) => {
    const held = Math.min(Math.max(t, 0), 1);
    return held * held * (3 - 2 * held);
  };
  return eased((gap - x) * z) - eased((gap - y) * w);
}

function soft(over: Partial<SoftModel> = {}): SoftModel {
  return { beginIn: 0, deltaIn: 0, beginOut: 0, deltaOut: 0, target: SOFT_TARGET.both, ...over };
}

describe("softParams", () => {
  it("packs the two begins, then one over each width", () => {
    expect(softParams(soft({ beginIn: 20, deltaIn: 10, beginOut: 60, deltaOut: 4 }))).toEqual([
      20, 60, 0.1, 0.25,
    ]);
  });

  it("fades Ahri_Base_R_mis_02's cone in over ten units past a gap of twenty", () => {
    const params = softParams(soft({ beginIn: 20, deltaIn: 10 }));

    expect(fadeAt(15, params)).toBe(0);
    expect(fadeAt(25, params)).toBeCloseTo(0.5);
    expect(fadeAt(30, params)).toBe(1);
    expect(fadeAt(500, params)).toBe(1);
  });

  it("fades out from a gap of beginOut in its own right, over deltaOut", () => {
    /* `AurelionSol_Skin11_E_ExecuteZone_ChildParticle`'s `REFLECTION_SPHERE4`. */
    const params = softParams(soft({ deltaIn: 75, beginOut: 60, deltaOut: 60 }));

    expect(fadeAt(0, params)).toBe(0);
    expect(fadeAt(60, params)).toBeCloseTo(0.896);
    expect(fadeAt(90, params)).toBeCloseTo(0.5);
    expect(fadeAt(120, params)).toBe(0);
    expect(fadeAt(500, params)).toBe(0);
  });

  it("draws a band where beginOut stands at the end of the fade in", () => {
    const params = softParams(soft({ deltaIn: 10, beginOut: 10, deltaOut: 10 }));

    expect(fadeAt(0, params)).toBe(0);
    expect(fadeAt(10, params)).toBe(1);
    expect(fadeAt(20, params)).toBe(0);
    for (const gap of [2, 5, 15, 18]) expect(fadeAt(gap, params)).toBeGreaterThan(0);
  });

  it("fades nothing out for a beginOut at or under zero, whatever its deltaOut", () => {
    /* `Akali_Base_E_Enemy_Indicator_Red`'s `Light_right`, `0, 10, 0, 10`, and 1,648 like it. */
    for (const beginOut of [0, -5]) {
      const params = softParams(soft({ deltaIn: 10, beginOut, deltaOut: 10 }));

      expect(params[1]).toBe(1e8);
      expect(fadeAt(0, params)).toBe(0);
      expect(fadeAt(10, params)).toBe(1);
      for (const gap of [20, 500, 100_000]) expect(fadeAt(gap, params)).toBe(1);
    }
  });

  it("holds the rate of a side of no width finite, which makes that side a step at its begin", () => {
    const params = softParams(soft({ beginIn: 100, beginOut: 300 }));

    expect(params).toEqual([100, 300, 1e8, 1e8]);
    expect(fadeAt(99, params)).toBe(0);
    expect(fadeAt(101, params)).toBe(1);
    expect(fadeAt(299, params)).toBe(1);
    expect(fadeAt(301, params)).toBe(0);
  });

  it("draws nothing where both sides step at the same gap", () => {
    /* `Brand_Skin08_Z_Recall_DrangonPowerDown`'s `Dragonup4`, `100, 0, 100, 0`. */
    const params = softParams(soft({ beginIn: 100, beginOut: 100 }));

    for (const gap of [-50, 0, 50, 150, 5000]) expect(fadeAt(gap, params)).toBe(0);
  });

  it("keeps the fade in alone where the block writes no fade out", () => {
    const params = softParams(soft({ deltaIn: 30 }));

    expect(fadeAt(0, params)).toBe(0);
    expect(fadeAt(30, params)).toBe(1);
    expect(fadeAt(10_000, params)).toBe(1);
  });
});

describe("softControl", () => {
  /** What a fade of `fade` leaves of a colour and an alpha of one. */
  function drawn(target: SoftTarget, fade: number): [number, number] {
    const [x, y, z, w] = softControl(target);
    return [x + fade * y, z + fade * w];
  }

  it("fades the alpha alone where the block targets the alpha", () => {
    expect(softControl(SOFT_TARGET.alpha)).toEqual([1, 0, 0, 1]);
    expect(drawn(SOFT_TARGET.alpha, 0.25)).toEqual([1, 0.25]);
  });

  it("fades the colour alone where the block targets the colour", () => {
    expect(softControl(SOFT_TARGET.colour)).toEqual([0, 1, 1, 0]);
    expect(drawn(SOFT_TARGET.colour, 0.25)).toEqual([0.25, 1]);
  });

  it("fades both where the block names neither, and for a byte outside the enum", () => {
    expect(softControl(SOFT_TARGET.both)).toEqual([0, 1, 0, 1]);
    expect(drawn(SOFT_TARGET.both, 0.25)).toEqual([0.25, 0.25]);
    expect(softControl(9 as SoftTarget)).toEqual([0, 1, 0, 1]);
  });
});

describe("fadeOf", () => {
  const faded = soft({ deltaIn: 30 });
  const of = (quadType: QuadType, uvMode: UvMode = UV_MODE.default) =>
    fadeOf(emitterOf(0, { soft: faded, quadType, uvMode }));

  it("fades a quad, a ray, a mesh and a ribbon", () => {
    for (const kind of [
      QUAD_TYPE.cameraQuad,
      QUAD_TYPE.arbitraryQuad,
      QUAD_TYPE.ray,
      QUAD_TYPE.mesh,
      QUAD_TYPE.cameraTrail,
      QUAD_TYPE.arbitraryTrail,
      QUAD_TYPE.beam,
    ]) {
      expect(of(kind)).toBe(faded);
    }
  });

  it("fades no attached mesh, whose skinned shader compiles no soft fade", () => {
    expect(of(QUAD_TYPE.attachedMesh)).toBeNull();
  });

  it("fades no quad or ribbon under LOCK_ALPHA and still fades a mesh under it", () => {
    for (const kind of [
      QUAD_TYPE.cameraQuad,
      QUAD_TYPE.arbitraryQuad,
      QUAD_TYPE.ray,
      QUAD_TYPE.cameraTrail,
      QUAD_TYPE.arbitraryTrail,
      QUAD_TYPE.beam,
    ]) {
      expect(of(kind, UV_MODE.lockAlpha)).toBeNull();
    }
    expect(of(QUAD_TYPE.mesh, UV_MODE.lockAlpha)).toBe(faded);
  });

  it("fades nothing for an emitter without the block", () => {
    const plain = emitterOf(0, { soft: null, quadType: QUAD_TYPE.mesh });

    expect(fadeOf(plain)).toBeNull();
    expect(fades(plain)).toBe(false);
    expect(fades(emitterOf(0, { soft: faded }))).toBe(true);
  });
});
