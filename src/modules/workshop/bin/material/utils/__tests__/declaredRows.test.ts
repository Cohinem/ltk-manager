import { describe, expect, it } from "vitest";

import type { BinRow } from "@/lib/tauri";

import { componentCount, declaredRows } from "../declaredRows";

const ENTRY = "0x2a1f3c7d";

function element(index: number, name: string): BinRow {
  return {
    entry: ENTRY,
    path: `d0ab46b8[${index}]`,
    label: `[${index}]`,
    node: "element",
    name,
    unnamed: false,
    kind: null,
    value: { type: "struct", classHash: "0x1", class: "StaticMaterialShaderParamDef", len: 2 },
    declared: null,
  };
}

const nameOf = (row: BinRow) => row.name;
const declared = (name: string) => ({ name });

describe("declaredRows", () => {
  it("lists every declaration in the shader's order, with the entry that sets it", () => {
    const tint = element(0, "TintColor");
    const rows = declaredRows([tint], nameOf, [declared("Alpha"), declared("TintColor")]);

    expect(rows.map((row) => [row.name, row.element])).toEqual([
      ["Alpha", null],
      ["TintColor", tint],
    ]);
    expect(rows[0].key).toBe("declared:Alpha");
    expect(rows[1].key).toBe(`${ENTRY}:d0ab46b8[0]`);
  });

  it("puts an entry the shader does not declare after the declarations", () => {
    const stray = element(0, "Nobody");
    const rows = declaredRows([stray], nameOf, [declared("Alpha")]);

    expect(rows.map((row) => [row.name, row.declared])).toEqual([
      ["Alpha", declared("Alpha")],
      ["Nobody", null],
    ]);
  });

  it("keeps a second entry of a declared name as a row of its own", () => {
    const first = element(0, "Alpha");
    const second = element(1, "Alpha");
    const rows = declaredRows([first, second], nameOf, [declared("Alpha")]);

    expect(rows.map((row) => row.element)).toEqual([first, second]);
    expect(rows[1].declared).toEqual(declared("Alpha"));
  });

  it("draws the entries alone before the shader answers", () => {
    const tint = element(0, "TintColor");

    expect(declaredRows([tint], nameOf, null)).toEqual([
      { key: `${ENTRY}:d0ab46b8[0]`, name: "TintColor", element: tint, declared: null },
    ]);
  });
});

describe("componentCount", () => {
  it("counts the components a mask selects", () => {
    expect([1, 3, 7, 15, 0b1000, 0b0110].map(componentCount)).toEqual([1, 2, 3, 4, 1, 2]);
  });
});
