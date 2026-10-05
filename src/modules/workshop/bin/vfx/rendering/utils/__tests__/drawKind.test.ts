import { describe, expect, it } from "vitest";

import {
  BLEND_MODE,
  DISTORTION_MODE,
  QUAD_TYPE,
  type QuadType,
  RENDER_PHASE,
} from "../../../engine/model/enums";
import type { DistortionModel, EmitterModel } from "../../../engine/model/model";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import {
  compareDrawOrder,
  distorts,
  drawPhases,
  drawRanks,
  drawsAsBeam,
  drawsAsMesh,
  drawsAsProjection,
  drawsAsQuad,
  drawsAsTrail,
  drawsTheAttachment,
  isUndrawn,
} from "../drawKind";
import { materialPreview } from "./materialFixture";

const UNDER = { colour: "under", warpsEarly: false, warpsLate: false };
const OVER = { colour: "over", warpsEarly: false, warpsLate: false };
const NOWHERE = { colour: null, warpsEarly: false, warpsLate: false };
const EARLY = { colour: null, warpsEarly: true, warpsLate: false };
const LATE = { colour: null, warpsEarly: false, warpsLate: true };

function warp(mode: number): DistortionModel {
  return { strength: 0.1, mode, map: null };
}

function phasesOf(over: Partial<EmitterModel>) {
  return drawPhases(emitterOf(0, over));
}

describe("drawPhases, left automatic", () => {
  it("draws by the sign of the pass: negative under the late distortion, the rest over it", () => {
    expect(phasesOf({ pass: -1 })).toEqual(UNDER);
    expect(phasesOf({ pass: -300 })).toEqual(UNDER);
    expect(phasesOf({ pass: 0 })).toEqual(OVER);
    expect(phasesOf({ pass: 12 })).toEqual(OVER);
  });

  it("draws a ground-layer emitter under, whatever its pass and whatever it warps", () => {
    expect(phasesOf({ groundLayer: true, pass: 12 })).toEqual(UNDER);
    expect(phasesOf({ groundLayer: true, distortion: warp(DISTORTION_MODE.all) })).toEqual(UNDER);
  });

  it("draws a HUD-layer emitter over, ahead of every other rule", () => {
    expect(phasesOf({ hudLayer: true, pass: -5 })).toEqual(OVER);
    expect(phasesOf({ hudLayer: true, groundLayer: true })).toEqual(OVER);
    expect(phasesOf({ hudLayer: true, distortion: warp(DISTORTION_MODE.all) })).toEqual(OVER);
  });

  it("warps late under distortionMode 1, early under 2 and in both phases under 3", () => {
    expect(phasesOf({ distortion: warp(1) })).toEqual(LATE);
    expect(phasesOf({ distortion: warp(2) })).toEqual(EARLY);
    expect(phasesOf({ distortion: warp(3) })).toEqual({
      colour: null,
      warpsEarly: true,
      warpsLate: true,
    });
  });

  it("draws a warping emitter in no colour phase, whatever its pass", () => {
    expect(phasesOf({ distortion: warp(1), pass: -5 }).colour).toBeNull();
    expect(phasesOf({ distortion: warp(2), pass: 5 }).colour).toBeNull();
  });

  it("draws a distortion block of mode zero as colour, by its pass", () => {
    expect(phasesOf({ distortion: warp(0), pass: -1 })).toEqual(UNDER);
    expect(phasesOf({ distortion: warp(0), pass: 0 })).toEqual(OVER);
  });

  it("draws a custom material's colour in place of the warp, unless the material is missing", () => {
    const distortion = warp(DISTORTION_MODE.all);

    expect(phasesOf({ distortion, customMaterial: materialPreview() })).toEqual(OVER);
    expect(phasesOf({ distortion, customMaterial: materialPreview(), pass: -1 })).toEqual(UNDER);
    expect(phasesOf({ distortion, customMaterial: materialPreview({ missing: true }) })).toEqual(
      LATE,
    );
  });
});

describe("drawPhases, forced by renderPhaseOverride", () => {
  /** An emitter every automatic rule would place elsewhere than `phase` does. */
  const forced = (renderPhaseOverride: number, over: Partial<EmitterModel> = {}) =>
    phasesOf({ renderPhaseOverride, ...over });

  it("draws under for the default phase, whatever its pass, its layer or its block", () => {
    expect(forced(RENDER_PHASE.default, { pass: 12 })).toEqual(UNDER);
    expect(forced(RENDER_PHASE.default, { hudLayer: true })).toEqual(UNDER);
    expect(forced(RENDER_PHASE.default, { distortion: warp(3) })).toEqual(UNDER);
  });

  it("draws under for the ground layer's phase", () => {
    expect(forced(RENDER_PHASE.groundLayer, { pass: 12 })).toEqual(UNDER);
    expect(forced(RENDER_PHASE.groundLayer, { distortion: warp(3) })).toEqual(UNDER);
  });

  it("draws over for the post-distortion phase, whatever its pass or its block", () => {
    expect(forced(RENDER_PHASE.postDistortion, { pass: -12 })).toEqual(OVER);
    expect(forced(RENDER_PHASE.postDistortion, { groundLayer: true })).toEqual(OVER);
    expect(forced(RENDER_PHASE.postDistortion, { distortion: warp(3) })).toEqual(OVER);
  });

  it("draws over for the HUD's phase on a HUD-layer emitter, and nowhere on any other", () => {
    expect(forced(RENDER_PHASE.hudLayer, { hudLayer: true, pass: -12 })).toEqual(OVER);
    expect(forced(RENDER_PHASE.hudLayer)).toEqual(NOWHERE);
  });

  it("warps early alone for the no-character phase, whichever phases the block names", () => {
    expect(forced(RENDER_PHASE.distortionNoCharacter, { distortion: warp(1) })).toEqual(EARLY);
    expect(forced(RENDER_PHASE.distortionNoCharacter, { distortion: warp(3) })).toEqual(EARLY);
    expect(forced(RENDER_PHASE.distortionNoCharacter, { distortion: warp(0) })).toEqual(EARLY);
  });

  it("warps late alone for the distortion phase, whichever phases the block names", () => {
    expect(forced(RENDER_PHASE.distortionAll, { distortion: warp(2) })).toEqual(LATE);
    expect(forced(RENDER_PHASE.distortionAll, { distortion: warp(3) })).toEqual(LATE);
    expect(forced(RENDER_PHASE.distortionAll, { distortion: warp(0) })).toEqual(LATE);
  });

  it("draws nowhere in a distortion phase without a block, or under a custom material", () => {
    const custom = { distortion: warp(3), customMaterial: materialPreview() };

    expect(forced(RENDER_PHASE.distortionNoCharacter)).toEqual(NOWHERE);
    expect(forced(RENDER_PHASE.distortionAll)).toEqual(NOWHERE);
    expect(forced(RENDER_PHASE.distortionNoCharacter, custom)).toEqual(NOWHERE);
    expect(forced(RENDER_PHASE.distortionAll, custom)).toEqual(NOWHERE);
  });

  it("draws nowhere for the shadow phase and for a value naming no phase", () => {
    for (const phase of [RENDER_PHASE.shadow, 8, 9, 255]) {
      expect(forced(phase)).toEqual(NOWHERE);
      expect(forced(phase, { hudLayer: true, distortion: warp(3) })).toEqual(NOWHERE);
    }
  });
});

describe("distorts", () => {
  const distorting = (over: Partial<EmitterModel>) => distorts(emitterOf(0, over));

  it("is true for a block naming either distortion phase, and false for one of mode zero", () => {
    expect(distorting({ distortion: warp(1) })).toBe(true);
    expect(distorting({ distortion: warp(2) })).toBe(true);
    expect(distorting({ distortion: warp(3) })).toBe(true);
    expect(distorting({ distortion: warp(0) })).toBe(false);
    expect(distorting({})).toBe(false);
  });

  it("is false where the emitter's layer or its override puts it in a colour phase", () => {
    expect(distorting({ distortion: warp(3), groundLayer: true })).toBe(false);
    expect(distorting({ distortion: warp(3), hudLayer: true })).toBe(false);
    expect(
      distorting({ distortion: warp(3), renderPhaseOverride: RENDER_PHASE.postDistortion }),
    ).toBe(false);
  });

  it("is true for a block of mode zero an override forces into a distortion phase", () => {
    expect(
      distorting({ distortion: warp(0), renderPhaseOverride: RENDER_PHASE.distortionAll }),
    ).toBe(true);
  });
});

/** What a kind needs beside its `quadType` before its predicate can answer. */
const PARTS: Partial<EmitterModel> = {
  mesh: {} as EmitterModel["mesh"],
  trail: {} as EmitterModel["trail"],
  beam: {} as EmitterModel["beam"],
};

/** The draw paths `emitter` takes, by name. */
function pathsOf(emitter: EmitterModel): string[] {
  const paths: [string, boolean][] = [
    ["quad", drawsAsQuad(emitter)],
    ["mesh", drawsAsMesh(emitter)],
    ["trail", drawsAsTrail(emitter)],
    ["beam", drawsAsBeam(emitter)],
    ["projection", drawsAsProjection(emitter)],
    ["attachment", drawsTheAttachment(emitter)],
  ];
  return paths.filter(([, draws]) => draws).map(([name]) => name);
}

/** An emitter of `quadType` carrying only the block its own kind reads. */
function kindOf(quadType: QuadType, over: Partial<EmitterModel> = {}): EmitterModel {
  const trails = quadType === QUAD_TYPE.cameraTrail || quadType === QUAD_TYPE.arbitraryTrail;
  const beams = quadType === QUAD_TYPE.beam || quadType === QUAD_TYPE.cameraSegmentBeam;
  return emitterOf(0, {
    quadType,
    mesh: quadType === QUAD_TYPE.mesh ? PARTS.mesh : null,
    trail: trails ? PARTS.trail : null,
    beam: beams ? PARTS.beam : null,
    ...over,
  });
}

describe("the draw path of a kind", () => {
  it("draws each kind of a complex emitter on its own path", () => {
    expect(pathsOf(kindOf(QUAD_TYPE.cameraQuad))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.cameraUnitQuad))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.arbitraryQuad))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.ray))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.mesh))).toEqual(["mesh"]);
    expect(pathsOf(kindOf(QUAD_TYPE.cameraTrail))).toEqual(["trail"]);
    expect(pathsOf(kindOf(QUAD_TYPE.arbitraryTrail))).toEqual(["trail"]);
    expect(pathsOf(kindOf(QUAD_TYPE.beam))).toEqual(["beam"]);
    expect(pathsOf(kindOf(QUAD_TYPE.planarProjection))).toEqual(["projection"]);
    expect(pathsOf(kindOf(QUAD_TYPE.attachedMesh))).toEqual(["attachment"]);
  });

  it("draws a simple emitter's camera quad, arbitrary quad, mesh, projection and attached mesh", () => {
    const simple = { simple: true };

    expect(pathsOf(kindOf(QUAD_TYPE.cameraQuad, simple))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.arbitraryQuad, simple))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.mesh, simple))).toEqual(["mesh"]);
    expect(pathsOf(kindOf(QUAD_TYPE.planarProjection, simple))).toEqual(["projection"]);
    expect(pathsOf(kindOf(QUAD_TYPE.attachedMesh, simple))).toEqual(["attachment"]);
  });

  it("draws no other kind of a simple emitter, and counts none of them as unsupported", () => {
    for (const kind of [
      QUAD_TYPE.ray,
      QUAD_TYPE.cameraTrail,
      QUAD_TYPE.arbitraryTrail,
      QUAD_TYPE.beam,
      QUAD_TYPE.cameraUnitQuad,
      QUAD_TYPE.cameraSegmentBeam,
    ]) {
      const simple = kindOf(kind, { simple: true });

      expect(pathsOf(simple)).toEqual([]);
      expect(isUndrawn(simple)).toBe(false);
    }
  });

  it("draws nothing for a simple emitter naming no kind, where a complex one is unsupported", () => {
    const unnamed = { quadType: null };

    expect(pathsOf(emitterOf(0, { ...unnamed, simple: true }))).toEqual([]);
    expect(isUndrawn(emitterOf(0, { ...unnamed, simple: true }))).toBe(false);
    expect(pathsOf(emitterOf(0, unnamed))).toEqual([]);
    expect(isUndrawn(emitterOf(0, unnamed))).toBe(true);
  });

  it("draws an emitter in no render phase on no path, and counts it as none unsupported", () => {
    for (const kind of Object.values(QUAD_TYPE)) {
      const hidden = kindOf(kind, { renderPhaseOverride: RENDER_PHASE.shadow });

      expect(pathsOf(hidden)).toEqual([]);
      expect(isUndrawn(hidden)).toBe(false);
    }
    expect(isUndrawn(emitterOf(0, { quadType: null, renderPhaseOverride: 1 }))).toBe(false);
  });

  it("keeps a warping emitter on the path of its kind", () => {
    const distortion = warp(DISTORTION_MODE.noCharacter);

    expect(pathsOf(kindOf(QUAD_TYPE.cameraQuad, { distortion }))).toEqual(["quad"]);
    expect(pathsOf(kindOf(QUAD_TYPE.mesh, { distortion }))).toEqual(["mesh"]);
  });

  it("draws no ribbon for a beam that names a mesh", () => {
    expect(pathsOf(kindOf(QUAD_TYPE.beam, { mesh: PARTS.mesh }))).toEqual([]);
  });
});

describe("compareDrawOrder", () => {
  /** The emitter indices in the order the comparator leaves them. */
  function ordered(...emitters: EmitterModel[]): number[] {
    return [...emitters].sort(compareDrawOrder).map((emitter) => emitter.index);
  }

  it("draws a complex emitter before a simple one of the same pass", () => {
    const simple = emitterOf(0, { simple: true, pass: 3 });
    const complex = emitterOf(1, { pass: 3 });

    expect(compareDrawOrder(complex, simple)).toBeLessThan(0);
    expect(compareDrawOrder(simple, complex)).toBeGreaterThan(0);
    expect(ordered(simple, complex)).toEqual([1, 0]);
  });

  it("orders by pass first, so a simple emitter of a lower pass still draws first", () => {
    const simple = emitterOf(0, { simple: true, pass: -1 });
    const complex = emitterOf(1, { pass: 0 });

    expect(ordered(complex, simple)).toEqual([0, 1]);
  });

  it("splits a complex emitter from a simple one before it reads the blend rank", () => {
    /* `none` ranks first of the blend modes and `add` after it. */
    const simple = emitterOf(0, { simple: true, blendMode: BLEND_MODE.none });
    const complex = emitterOf(1, { blendMode: BLEND_MODE.add });

    expect(ordered(simple, complex)).toEqual([1, 0]);
  });

  it("falls to the blend rank, the render flags and then the emitter's own place", () => {
    const first = emitterOf(0, { blendMode: BLEND_MODE.add, miscRenderFlags: 1 });
    const second = emitterOf(1, { blendMode: BLEND_MODE.add });
    const third = emitterOf(2, { blendMode: BLEND_MODE.none, miscRenderFlags: 4 });
    const fourth = emitterOf(3, { blendMode: BLEND_MODE.add });

    expect(ordered(first, second, third, fourth)).toEqual([2, 1, 3, 0]);
  });

  it("draws the ground layer before everything else, whatever the pass", () => {
    const ground = emitterOf(0, { groundLayer: true, simple: true, pass: 50 });
    const plain = emitterOf(1, { pass: -50 });

    expect(ordered(plain, ground)).toEqual([0, 1]);
  });
});

describe("drawRanks", () => {
  it("ranks each emitter index by its place in the draw order", () => {
    const ranks = drawRanks([
      emitterOf(0, { simple: true }),
      emitterOf(1, { pass: 2 }),
      emitterOf(2),
      emitterOf(3, { pass: -1, simple: true }),
    ]);

    expect([0, 1, 2, 3].map((index) => ranks.get(index))).toEqual([2, 3, 1, 0]);
  });
});
