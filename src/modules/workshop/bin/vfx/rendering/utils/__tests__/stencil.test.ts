import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  KeepStencilOp,
  NotEqualStencilFunc,
  ReplaceStencilOp,
} from "three";
import { describe, expect, it } from "vitest";

import { STENCIL_MODE } from "../../../engine/model/enums";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import {
  NO_STENCIL,
  type StencilClaim,
  stencilOf,
  stencilReferences,
  stencilState,
  stencilStates,
  type StencilUse,
} from "../stencil";
import { materialPreview } from "./materialFixture";

function stencilUse(mode: StencilUse["mode"], ref: number, id: string | null = null): StencilUse {
  return { mode, ref, id };
}

function claim(mode: StencilUse["mode"], ref: number, live = true): StencilClaim {
  return { use: stencilUse(mode, ref), live };
}

describe("stencilOf", () => {
  it("returns the mode, the reference and the id of an emitter with a mode", () => {
    const emitter = emitterOf(0, {
      stencilMode: STENCIL_MODE.testEqual,
      stencilRef: 7,
      stencilReferenceId: "0x12345678",
    });

    expect(stencilOf(emitter)).toEqual({
      mode: STENCIL_MODE.testEqual,
      ref: 7,
      id: "0x12345678",
    });
  });

  it("returns null for the disabled mode", () => {
    expect(stencilOf(emitterOf(0, { stencilMode: STENCIL_MODE.disabled }))).toBeNull();
  });

  it("returns null under a resolved custom material and the use under a missing one", () => {
    const stencil = { stencilMode: STENCIL_MODE.writeMask, stencilRef: 1 };
    const resolved = emitterOf(0, { ...stencil, customMaterial: materialPreview() });
    const missing = emitterOf(0, {
      ...stencil,
      customMaterial: materialPreview({ missing: true }),
    });

    expect(stencilOf(resolved)).toBeNull();
    expect(stencilOf(missing)?.mode).toBe(STENCIL_MODE.writeMask);
  });
});

describe("stencilState", () => {
  it("maps each mode to its compare and its write", () => {
    const states = [
      STENCIL_MODE.writeMask,
      STENCIL_MODE.testEqual,
      STENCIL_MODE.testNotEqual,
      STENCIL_MODE.writeMaskIfTestNotEqual,
    ].map((mode) => stencilState(stencilUse(mode, 5), 5));

    expect(states.map((state) => state.stencilFunc)).toEqual([
      AlwaysStencilFunc,
      EqualStencilFunc,
      NotEqualStencilFunc,
      NotEqualStencilFunc,
    ]);
    expect(states.map((state) => state.stencilZPass)).toEqual([
      ReplaceStencilOp,
      KeepStencilOp,
      KeepStencilOp,
      ReplaceStencilOp,
    ]);
    expect(states.every((state) => state.stencilWrite)).toBe(true);
  });

  it("compares and writes the low six bits only", () => {
    const state = stencilState(stencilUse(STENCIL_MODE.writeMask, 70), 70);

    expect(state.stencilRef).toBe(6);
    expect(state.stencilFuncMask).toBe(0x3f);
    expect(state.stencilWriteMask).toBe(0x3f);
  });
});

describe("stencilReferences", () => {
  it("gives each distinct id a value counting down from 63, and one value per id", () => {
    const claims = ["0xaa", "0xbb", "0xaa", "0xcc"].map((id) => ({
      use: stencilUse(STENCIL_MODE.testEqual, 9, id),
      live: true,
    }));

    expect(stencilReferences(claims)).toEqual([63, 62, 63, 61]);
  });

  it("reads a numbered reference modulo 64", () => {
    const claims = [claim(STENCIL_MODE.testEqual, 3), claim(STENCIL_MODE.testEqual, 67)];

    expect(stencilReferences(claims)).toEqual([3, 3]);
  });

  it("wraps the 65th id back to 63", () => {
    const claims = Array.from({ length: 65 }, (_, at) => ({
      use: stencilUse(STENCIL_MODE.testEqual, 0, `0x${at + 1}`),
      live: true,
    }));

    const references = stencilReferences(claims);

    expect(references[63]).toBe(0);
    expect(references[64]).toBe(63);
  });
});

describe("stencilStates", () => {
  it("tests an emitter against a reference a live emitter writes", () => {
    const [writer, tester] = stencilStates([
      claim(STENCIL_MODE.writeMask, 4),
      claim(STENCIL_MODE.testEqual, 4),
    ]);

    expect(writer.stencilZPass).toBe(ReplaceStencilOp);
    expect([tester.stencilWrite, tester.stencilFunc, tester.stencilRef]).toEqual([
      true,
      EqualStencilFunc,
      4,
    ]);
  });

  it("draws a TestEqual emitter untested while no live emitter writes its reference", () => {
    const alone = stencilStates([claim(STENCIL_MODE.testEqual, 4)]);
    const otherReference = stencilStates([
      claim(STENCIL_MODE.writeMask, 5),
      claim(STENCIL_MODE.testEqual, 4),
    ]);
    const hiddenWriter = stencilStates([
      claim(STENCIL_MODE.writeMask, 4, false),
      claim(STENCIL_MODE.testEqual, 4),
    ]);

    expect(alone[0]).toBe(NO_STENCIL);
    expect(otherReference[1]).toBe(NO_STENCIL);
    expect(hiddenWriter[1]).toBe(NO_STENCIL);
  });

  it("tests a TestEqual emitter of reference 0 against any mask, so it draws outside every mask", () => {
    const [, tester] = stencilStates([
      claim(STENCIL_MODE.writeMask, 2),
      claim(STENCIL_MODE.testEqual, 0),
    ]);

    expect([tester.stencilWrite, tester.stencilFunc, tester.stencilRef]).toEqual([
      true,
      EqualStencilFunc,
      0,
    ]);
  });

  it("draws a TestNotEqual emitter of reference 0 untested only while the scene writes nothing", () => {
    const alone = stencilStates([claim(STENCIL_MODE.testNotEqual, 0)]);
    const [, masked] = stencilStates([
      claim(STENCIL_MODE.writeMask, 2),
      claim(STENCIL_MODE.testNotEqual, 0),
    ]);

    expect(alone[0]).toBe(NO_STENCIL);
    expect([masked.stencilWrite, masked.stencilFunc]).toEqual([true, NotEqualStencilFunc]);
  });

  it("tests a TestNotEqual emitter of a non-zero reference whether or not it is written", () => {
    const [state] = stencilStates([claim(STENCIL_MODE.testNotEqual, 4)]);

    expect([state.stencilWrite, state.stencilFunc, state.stencilRef]).toEqual([
      true,
      NotEqualStencilFunc,
      4,
    ]);
  });

  it("tests a mode 4 emitter against its own writes", () => {
    const [state] = stencilStates([claim(STENCIL_MODE.writeMaskIfTestNotEqual, 2)]);

    expect([state.stencilFunc, state.stencilZPass]).toEqual([
      NotEqualStencilFunc,
      ReplaceStencilOp,
    ]);
  });

  it("matches a writer and a tester that name the same id", () => {
    const [, tester] = stencilStates([
      { use: stencilUse(STENCIL_MODE.writeMask, 1, "0xaa"), live: true },
      { use: stencilUse(STENCIL_MODE.testEqual, 2, "0xaa"), live: true },
    ]);

    expect([tester.stencilWrite, tester.stencilRef]).toEqual([true, 63]);
  });
});
