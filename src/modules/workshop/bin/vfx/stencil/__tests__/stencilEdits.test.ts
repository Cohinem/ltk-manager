import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { STENCIL_MODE } from "../../engine/model/enums";
import { joinEdits, maskEdits, modeEdits, newMaskEdits } from "../stencilEdits";

/** The path of the field `name` of the struct at `parent`. */
function at(parent: string, name: string): string {
  return parent + "." + nameHash(name).slice(2);
}

function struct(fields: Record<string, VfxValue>): VfxValue {
  return {
    type: "struct",
    classHash: nameHash("VfxEmitterDefinitionData"),
    class: null,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({ hash: nameHash(name), name, value })),
  };
}

describe("modeEdits", () => {
  it("adds the field and writes the mode on the emitter at the index", () => {
    expect(modeEdits(3, STENCIL_MODE.testEqual)).toEqual([
      { type: "ensureProperty", path: "[3]", field: nameHash("stencilMode") },
      { type: "setLeaf", path: at("[3]", "stencilMode"), value: { type: "integer", text: "2" } },
    ]);
  });
});

describe("maskEdits", () => {
  it("writes the reference of a numbered mask", () => {
    expect(maskEdits(0, { id: null, ref: 5 }, struct({}))).toEqual([
      { type: "ensureProperty", path: "[0]", field: nameHash("stencilRef") },
      { type: "setLeaf", path: at("[0]", "stencilRef"), value: { type: "integer", text: "5" } },
    ]);
  });

  it("clears an authored id when it writes a numbered mask", () => {
    const node = struct({ StencilReferenceId: { type: "hash", hash: "0x0badf00d", name: null } });

    expect(maskEdits(0, { id: null, ref: 5 }, node).at(-1)).toEqual({
      type: "setLeaf",
      path: at("[0]", "StencilReferenceId"),
      value: { type: "hash", text: "0x00000000" },
    });
  });

  it("writes the id of a named mask and leaves the reference", () => {
    expect(maskEdits(1, { id: "0x0badf00d", ref: 0 }, struct({}))).toEqual([
      { type: "ensureProperty", path: "[1]", field: nameHash("StencilReferenceId") },
      {
        type: "setLeaf",
        path: at("[1]", "StencilReferenceId"),
        value: { type: "hash", text: "0x0badf00d" },
      },
    ]);
  });
});

describe("joinEdits", () => {
  it("writes the mode, then the mask", () => {
    const edits = joinEdits(2, STENCIL_MODE.testEqual, { id: null, ref: 7 }, null);

    expect(edits).toEqual([
      ...modeEdits(2, STENCIL_MODE.testEqual),
      ...maskEdits(2, { id: null, ref: 7 }, null),
    ]);
  });
});

describe("newMaskEdits", () => {
  it("copies the source to the next place and writes the copy as a writer one pass earlier", () => {
    const edits = newMaskEdits({ index: 1, node: struct({}), pass: -3 }, 4, "glow_mask");

    expect(edits[0]).toEqual({ type: "copyItem", from: "[1]", path: "", index: 2, unique: null });
    expect(edits).toContainEqual({
      type: "setLeaf",
      path: at("[2]", "emitterName"),
      value: { type: "string", value: "glow_mask" },
    });
    expect(edits).toContainEqual({
      type: "setLeaf",
      path: at("[2]", "stencilMode"),
      value: { type: "integer", text: "1" },
    });
    expect(edits).toContainEqual({
      type: "setLeaf",
      path: at("[2]", "pass"),
      value: { type: "integer", text: "-4" },
    });
    expect(edits).toContainEqual({
      type: "setLeaf",
      path: at(at("[2]", "Color"), "constantValue"),
      value: { type: "vector", values: [0, 0, 0, 1] },
    });
  });

  it("puts the source inside the mask on the same reference", () => {
    const edits = newMaskEdits({ index: 1, node: struct({}), pass: 0 }, 4, "glow_mask");

    expect(edits.slice(-4)).toEqual(
      joinEdits(1, STENCIL_MODE.testEqual, { id: null, ref: 4 }, null),
    );
  });

  it("clears the copy's colour curve and child set only where the source has them", () => {
    const animated = struct({
      Color: struct({ dynamics: struct({}) }),
      childParticleSetDefinition: struct({}),
    });
    const cleared = (node: VfxValue) =>
      newMaskEdits({ index: 0, node, pass: 0 }, 1, "m").filter(
        (edit) => edit.type === "replacePointer",
      );

    expect(cleared(struct({}))).toEqual([]);
    expect(cleared(animated)).toEqual([
      { type: "replacePointer", path: at(at("[1]", "Color"), "dynamics"), class: null },
      { type: "replacePointer", path: at("[1]", "childParticleSetDefinition"), class: null },
    ]);
  });

  it("does not write a pass below the least an i16 takes", () => {
    const edits = newMaskEdits({ index: 0, node: struct({}), pass: -32768 }, 1, "m");

    expect(edits).toContainEqual({
      type: "setLeaf",
      path: at("[1]", "pass"),
      value: { type: "integer", text: "-32768" },
    });
  });
});
