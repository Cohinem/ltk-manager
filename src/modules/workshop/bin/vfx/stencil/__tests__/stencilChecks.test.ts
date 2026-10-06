import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { emptySystem } from "../../engine/model/systemModel";
import { emitterOf } from "../../engine/simulation/__tests__/emitterFixture";
import { materialPreview } from "../../rendering/utils/__tests__/materialFixture";
import { stencilChecks } from "../stencilChecks";

/** An emitter node with the stencil fields `fields` names. */
function node(fields: { mode?: number; ref?: number; id?: string }): VfxValue {
  const entries: [string, VfxValue][] = [];
  if (fields.mode !== undefined) {
    entries.push(["stencilMode", { type: "number", value: fields.mode }]);
  }
  if (fields.ref !== undefined) {
    entries.push(["stencilRef", { type: "number", value: fields.ref }]);
  }
  if (fields.id !== undefined) {
    entries.push(["StencilReferenceId", { type: "hash", hash: fields.id, name: null }]);
  }

  return {
    type: "struct",
    classHash: nameHash("VfxEmitterDefinitionData"),
    class: null,
    object: null,
    fields: entries.map(([name, value]) => ({ hash: nameHash(name), name, value })),
  };
}

function stencilled(index: number, mode: number, ref: number, pass = 0): EmitterModel {
  return emitterOf(index, {
    name: "e" + index,
    pass,
    stencilMode: mode as EmitterModel["stencilMode"],
    stencilRef: ref,
  });
}

function systemOf(emitters: readonly EmitterModel[]): SystemModel {
  return { ...emptySystem("0x1"), emitters };
}

function ids(found: readonly { id: string }[]): string[] {
  return found.map((check) => check.id);
}

describe("stencilChecks", () => {
  it("fails nothing for an emitter with no stencil fields", () => {
    const context = { simple: false, emitter: undefined, system: null };

    expect(stencilChecks(node({}), context)).toEqual([]);
    expect(stencilChecks(null, context)).toEqual([]);
  });

  it("notes an id set while the mode is off", () => {
    const context = { simple: false, emitter: undefined, system: null };

    expect(ids(stencilChecks(node({ id: "0x0badf00d" }), context))).toEqual(["idWithoutMode"]);
    expect(stencilChecks(node({ id: "0x00000000" }), context)).toEqual([]);
  });

  it("warns that a simple emitter reads no stencil fields", () => {
    const context = { simple: true, emitter: undefined, system: null };

    expect(ids(stencilChecks(node({ mode: 2, ref: 1 }), context))).toEqual(["simpleIgnored"]);
  });

  it("warns that a resolved custom material replaces the fields", () => {
    const emitter = { ...stencilled(0, 2, 1), customMaterial: materialPreview() };
    const context = { simple: false, emitter, system: systemOf([emitter]) };

    expect(ids(stencilChecks(node({ mode: 2, ref: 1 }), context))).toEqual(["materialIgnored"]);
  });

  it("notes a reference an id replaces, and a reference past 63", () => {
    const context = { simple: false, emitter: undefined, system: null };

    expect(ids(stencilChecks(node({ mode: 1, ref: 3, id: "0x0badf00d" }), context))).toEqual([
      "refReplaced",
    ]);
    expect(stencilChecks(node({ mode: 1, ref: 70 }), context)).toEqual([
      { id: "refWraps", tone: "info", ref: 70, reads: 6 },
    ]);
  });

  it("notes a tester whose mask no emitter of the system writes, by its role", () => {
    const inside = stencilled(0, 2, 4);
    const outside = stencilled(1, 3, 5);
    const system = systemOf([inside, outside]);

    expect(
      stencilChecks(node({ mode: 2, ref: 4 }), { simple: false, emitter: inside, system }),
    ).toEqual([{ id: "noWriter", tone: "info", role: "inside" }]);
    expect(
      stencilChecks(node({ mode: 3, ref: 5 }), { simple: false, emitter: outside, system }),
    ).toEqual([{ id: "noWriter", tone: "info", role: "outside" }]);
  });

  it("fails nothing for a test against reference 0 with no writer", () => {
    const emitter = stencilled(0, 2, 0);
    const context = { simple: false, emitter, system: systemOf([emitter]) };

    expect(stencilChecks(node({ mode: 2 }), context)).toEqual([]);
  });

  it("warns where every writer of the mask draws after the tester", () => {
    const tester = stencilled(0, 2, 1, 5);
    const late = stencilled(1, 1, 1, 500);
    const early = stencilled(2, 1, 1, -10);
    const checked = (system: SystemModel) =>
      stencilChecks(node({ mode: 2, ref: 1 }), { simple: false, emitter: tester, system });

    expect(checked(systemOf([tester, late]))).toEqual([
      { id: "writerLater", tone: "warning", writer: "e1" },
    ]);
    expect(checked(systemOf([tester, late, early]))).toEqual([]);
  });

  it("notes a writer whose mask no emitter of the system tests", () => {
    const writer = stencilled(0, 1, 2);
    const tester = stencilled(1, 2, 2);
    const checked = (system: SystemModel) =>
      stencilChecks(node({ mode: 1, ref: 2 }), { simple: false, emitter: writer, system });

    expect(ids(checked(systemOf([writer])))).toEqual(["noTester"]);
    expect(checked(systemOf([writer, tester]))).toEqual([]);
  });
});
