import { describe, expect, it } from "vitest";

import { DRAG_MOTION, RENDER_PHASE, SOFT_TARGET } from "../../../engine/model/enums";
import type { EmitterModel, SystemModel } from "../../../engine/model/model";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { passesOf } from "../passes";

function systemOf(...emitters: EmitterModel[]): SystemModel {
  return {
    entry: null,
    name: null,
    emitters,
    transform: null,
    hudLayer: false,
    dragMotion: DRAG_MOTION.stepped,
    buildUpTime: 0,
  };
}

function warp(mode: number): EmitterModel["distortion"] {
  return { strength: 0.1, mode, map: null };
}

const SOFT = { beginIn: 0, deltaIn: 10, beginOut: 0, deltaOut: 0, target: SOFT_TARGET.both };

describe("passesOf", () => {
  it("asks for neither pass of a scene that warps and fades nothing", () => {
    expect(passesOf([systemOf(emitterOf(0)), null, undefined])).toEqual({
      warps: false,
      softens: false,
    });
  });

  it("asks for the warp pass of an emitter in either distortion phase", () => {
    expect(passesOf([systemOf(emitterOf(0, { distortion: warp(1) }))]).warps).toBe(true);
    expect(passesOf([systemOf(emitterOf(0, { distortion: warp(2) }))]).warps).toBe(true);
  });

  it("asks for no warp pass of a distortion block that is off or forced into a colour phase", () => {
    const off = emitterOf(0, { distortion: warp(0) });
    const forced = emitterOf(1, {
      distortion: warp(3),
      renderPhaseOverride: RENDER_PHASE.postDistortion,
    });

    expect(passesOf([systemOf(off, forced)]).warps).toBe(false);
  });

  it("asks for the depth pass of an emitter that fades, in any system of the scene", () => {
    const scene = [systemOf(emitterOf(0)), systemOf(emitterOf(0, { soft: SOFT }))];

    expect(passesOf(scene)).toEqual({ warps: false, softens: true });
  });

  it("reads the emitters of a child set as well as the opened system's", () => {
    const child = systemOf(emitterOf(0, { distortion: warp(1), soft: SOFT }));
    const parent = emitterOf(0, {
      childSet: {
        children: [child],
        bones: [],
        probability: { constant: [0], keys: [], tables: [] },
        onDeath: false,
        inheritance: null,
      },
    });

    expect(passesOf([systemOf(parent)])).toEqual({ warps: true, softens: true });
  });
});
