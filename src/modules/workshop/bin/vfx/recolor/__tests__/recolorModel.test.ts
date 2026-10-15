import { describe, expect, it } from "vitest";

import type { VfxField, VfxSystem, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { mapColors, recolorEdits, shiftHue } from "../recolorModel";

const SYSTEM = "0x2a1f3c7d";

function field(name: string, value: VfxValue): VfxField {
  return { hash: nameHash(name), name, value };
}

function struct(className: string, fields: VfxField[], object: string | null = null): VfxValue {
  return {
    type: "struct",
    classHash: nameHash(className),
    class: className,
    fields,
    object: object === null ? null : { entry: object, name: null },
  };
}

function vector(...values: number[]): VfxValue {
  return { type: "vector", values };
}

function valueColor(constant: number[], keys: number[][] = []): VfxValue {
  const fields = [field("constantValue", vector(...constant))];
  if (keys.length > 0) {
    fields.push(
      field(
        "dynamics",
        struct("VfxAnimatedColorVariableData", [
          field("values", { type: "container", items: keys.map((key) => vector(...key)) }),
        ]),
      ),
    );
  }
  return struct("ValueColor", fields);
}

const RED = [1, 0, 0, 1];
const GRAY = [0.5, 0.5, 0.5, 1];

function system(): VfxSystem {
  const emitter = struct("VfxEmitterDefinitionData", [
    field("color", valueColor(RED, [RED, GRAY])),
    field(
      "reflectionDefinition",
      struct("VfxReflectionDefinitionData", [field("fresnelColor", vector(0, 0, 1, 1))]),
    ),
    field(
      "erosionDefinition",
      struct("VfxAlphaErosionDefinitionData", [
        field("erosionMapChannelMixer", valueColor([1, 0, 0, 0])),
      ]),
    ),
    field("child", struct("VfxSystemDefinitionData", [field("color", valueColor(RED))], "0x11")),
  ]);
  return {
    entry: SYSTEM,
    name: null,
    classHash: nameHash("VfxSystemDefinitionData"),
    class: "VfxSystemDefinitionData",
    root: struct(
      "VfxSystemDefinitionData",
      [field("complexEmitterDefinitionData", { type: "container", items: [emitter] })],
      SYSTEM,
    ),
    materials: [],
  };
}

function close(values: readonly number[]): number[] {
  return values.map((each) => Math.round(each * 1000) / 1000);
}

describe("shiftHue", () => {
  it("returns green for red turned by 120 degrees", () => {
    expect(close(shiftHue(RED, 120))).toEqual([0, 1, 0, 1]);
  });

  it("returns blue for red turned by -120 degrees", () => {
    expect(close(shiftHue(RED, -120))).toEqual([0, 0, 1, 1]);
  });

  it("keeps the brightest channel of an HDR color", () => {
    expect(close(shiftHue([4, 1, 1], 120))).toEqual([1, 4, 1]);
  });

  it("returns a gray unchanged", () => {
    expect(shiftHue(GRAY, 90)).toEqual(GRAY);
  });
});

describe("mapColors", () => {
  it("visits the tints and skips the channel mixer and a linked system", () => {
    const paths: string[] = [];
    mapColors(system().root, (leaf) => {
      paths.push(`${leaf.holder}|${leaf.field}|${leaf.path}`);
      return leaf.values;
    });

    const list = nameHash("complexEmitterDefinitionData").slice(2);
    const color = nameHash("color");
    const values = `${nameHash("dynamics").slice(2)}.${nameHash("values").slice(2)}`;
    expect(paths).toEqual([
      `${list}[0]|${color}|${nameHash("constantValue").slice(2)}`,
      `${list}[0]|${color}|${values}[0]`,
      `${list}[0]|${color}|${values}[1]`,
      `${list}[0].${nameHash("reflectionDefinition").slice(2)}|${nameHash("fresnelColor")}|`,
    ]);
  });
});

describe("recolorEdits", () => {
  it("returns one grouped edit with a write per changed color", () => {
    const [edit, ...rest] = recolorEdits(system(), 120);
    if (edit?.kind !== "editProperties") throw new Error("not one grouped edit");

    expect(rest).toEqual([]);
    expect(edit.edits.map((each) => [each.field, each.edits.length])).toEqual([
      [nameHash("color"), 2],
      [nameHash("fresnelColor"), 1],
    ]);
    expect(edit.edits[0]?.entry).toBe(SYSTEM);
  });

  it("returns no edit if no color changes", () => {
    expect(recolorEdits(system(), 0)).toEqual([]);
  });
});
