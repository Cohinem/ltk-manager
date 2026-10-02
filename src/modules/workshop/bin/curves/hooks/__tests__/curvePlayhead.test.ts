import { describe, expect, it } from "vitest";

import type { BinRow } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmitterModel, SystemModel } from "../../../vfx/engine/model/model";
import { emitterAtRow } from "../curvePlayhead";

const COMPLEX = nameHash("complexEmitterDefinitionData").slice(2);
const SIMPLE = nameHash("simpleEmitterDefinitionData").slice(2);

const emitter = (simple: boolean, listIndex: number) =>
  ({ simple, listIndex, index: listIndex }) as EmitterModel;

const SYSTEM = {
  entry: "0x0000abcd",
  emitters: [emitter(false, 0), emitter(false, 1), emitter(true, 0)],
} as unknown as SystemModel;

const row = (path: string, entry = "0x0000ABCD") => ({ entry, path }) as BinRow;

describe("emitterAtRow", () => {
  it("names the emitter a row's path leads with, in either list", () => {
    expect(emitterAtRow(SYSTEM, row(`${COMPLEX}[1].d4e17a53`))).toBe(SYSTEM.emitters[1]);
    expect(emitterAtRow(SYSTEM, row(`${SIMPLE}[0].d4e17a53`))).toBe(SYSTEM.emitters[2]);
  });

  it("names none for a row of another object or outside the emitter lists", () => {
    expect(emitterAtRow(SYSTEM, row(`${COMPLEX}[0].d4e17a53`, "0x00001234"))).toBeUndefined();
    expect(emitterAtRow(SYSTEM, row("d4e17a53"))).toBeUndefined();
    expect(emitterAtRow(null, row(`${COMPLEX}[0]`))).toBeUndefined();
  });
});
