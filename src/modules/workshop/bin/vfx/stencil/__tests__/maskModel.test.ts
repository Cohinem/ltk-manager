import { describe, expect, it } from "vitest";

import { STENCIL_MODE } from "../../engine/model/enums";
import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { emptySystem } from "../../engine/model/systemModel";
import { emitterOf } from "../../engine/simulation/__tests__/emitterFixture";
import { materialPreview } from "../../rendering/utils/__tests__/materialFixture";
import { freeReference, maskKey, maskUse, stencilMasks } from "../maskModel";

function systemOf(emitters: readonly EmitterModel[]): SystemModel {
  return { ...emptySystem("0x1"), emitters };
}

function stencilled(index: number, mode: number, ref: number, id: string | null = null) {
  return emitterOf(index, {
    name: "e" + index,
    stencilMode: mode as EmitterModel["stencilMode"],
    stencilRef: ref,
    stencilReferenceId: id,
  });
}

describe("maskUse", () => {
  it("reads the role of each mode", () => {
    const roles = [1, 2, 3, 4].map((mode) => maskUse(stencilled(0, mode, 2))?.role);

    expect(roles).toEqual(["writes", "inside", "outside", "writesOutside"]);
  });

  it("reads two references equal modulo 64 as one mask", () => {
    expect(maskUse(stencilled(0, 2, 66))?.key).toBe(maskUse(stencilled(1, 1, 2))?.key);
  });

  it("names the mask by the id where the emitter has one, whatever its reference", () => {
    const left = maskUse(stencilled(0, 2, 5, "0xAABBCCDD"));
    const right = maskUse(stencilled(1, 1, 9, "0xaabbccdd"));

    expect(left?.key).toBe(right?.key);
    expect(left?.key).not.toBe(maskKey({ id: null, ref: 5 }));
  });

  it("returns null for the disabled mode and under a resolved custom material", () => {
    const off = stencilled(0, STENCIL_MODE.disabled, 2);
    const custom = { ...stencilled(1, 2, 2), customMaterial: materialPreview() };

    expect(maskUse(off)).toBeNull();
    expect(maskUse(custom)).toBeNull();
  });
});

describe("stencilMasks", () => {
  it("lists each mask with its writers and its testers, numbered masks first in ascending order", () => {
    const system = systemOf([
      stencilled(0, 2, 4),
      stencilled(1, 1, 4),
      stencilled(2, 3, 2, "0xaa"),
      stencilled(3, 4, 1),
      stencilled(4, 0, 9),
    ]);

    const masks = stencilMasks(system);

    expect(masks.map((mask) => [mask.id, mask.ref])).toEqual([
      [null, 1],
      [null, 4],
      ["0xaa", 0],
    ]);
    expect(masks[0].writers.map((emitter) => emitter.name)).toEqual(["e3"]);
    expect(masks[1].writers.map((emitter) => emitter.name)).toEqual(["e1"]);
    expect(masks[1].testers.map((emitter) => emitter.name)).toEqual(["e0"]);
    expect(masks[2].testers.map((emitter) => emitter.name)).toEqual(["e2"]);
  });

  it("lists no mask for a null system", () => {
    expect(stencilMasks(null)).toEqual([]);
  });
});

describe("freeReference", () => {
  it("returns the lowest reference from 1 that no numbered mask uses", () => {
    const masks = [
      { id: null, ref: 1 },
      { id: null, ref: 2 },
      { id: "0xaa", ref: 0 },
      { id: null, ref: 4 },
    ];

    expect(freeReference(masks)).toBe(3);
    expect(freeReference([])).toBe(1);
  });

  it("returns null where every reference from 1 to 63 is used", () => {
    const masks = Array.from({ length: 63 }, (_, at) => ({ id: null, ref: at + 1 }));

    expect(freeReference(masks)).toBeNull();
  });
});
