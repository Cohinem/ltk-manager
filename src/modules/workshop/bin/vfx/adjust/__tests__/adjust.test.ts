import { describe, expect, it } from "vitest";

import type { VfxField, VfxSystem, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { adjustEdits, NO_ADJUST, shiftHue } from "../adjustModel";
import { leafEdits, mapLeaves, type Pick } from "../systemWalk";

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

function number(value: number): VfxValue {
  return { type: "number", value };
}

/** Returns a value struct of `className` with a constant and, if `keys` holds any, a curve. */
function curve(className: string, constant: VfxValue, keys: VfxValue[] = []): VfxValue {
  const fields = [field("constantValue", constant)];
  if (keys.length > 0) {
    fields.push(
      field(
        "dynamics",
        struct("VfxAnimated", [field("values", { type: "container", items: keys })]),
      ),
    );
  }
  return struct(className, fields);
}

/** Returns a system whose one complex emitter holds `fields`. */
function systemOf(fields: VfxField[]): VfxSystem {
  return {
    entry: SYSTEM,
    name: null,
    classHash: nameHash("VfxSystemDefinitionData"),
    class: "VfxSystemDefinitionData",
    root: struct(
      "VfxSystemDefinitionData",
      [
        field("complexEmitterDefinitionData", {
          type: "container",
          items: [struct("VfxEmitterDefinitionData", fields)],
        }),
      ],
      SYSTEM,
    ),
    materials: [],
  };
}

/** The hash path step of `name`. */
function step(name: string): string {
  return nameHash(name).slice(2);
}

/** The hash path of the one emitter of `systemOf`. */
const EMITTER = `${step("complexEmitterDefinitionData")}[0]`;

const PICKED = new Set([nameHash("birthVelocity"), nameHash("mCutoff")]);
const pick: Pick<"length"> = (each) => (PICKED.has(each.hash) ? "length" : null);

function system() {
  return systemOf([
    field(
      "birthVelocity",
      curve("ValueVector3", vector(0, 10, 0), [vector(0, 1, 0), vector(0, 2, 0)]),
    ),
    field("primitive", struct("VfxPrimitiveCameraTrail", [field("mCutoff", number(40))])),
    field("velocity", curve("ValueVector3", vector(1, 1, 1))),
    field("child", struct("VfxSystemDefinitionData", [field("mCutoff", number(5))], "0x11")),
  ]);
}

describe("mapLeaves", () => {
  it("visits the constant and each key of a picked value, and a picked number", () => {
    const paths: string[] = [];
    mapLeaves(system().root, pick, (leaf) => {
      paths.push(`${leaf.holder}|${leaf.path}|${leaf.scalar}`);
      return leaf.values;
    });

    const keys = `${step("dynamics")}.${step("values")}`;
    expect(paths).toEqual([
      `${EMITTER}|${step("constantValue")}|false`,
      `${EMITTER}|${keys}[0]|false`,
      `${EMITTER}|${keys}[1]|false`,
      `${EMITTER}.${step("primitive")}||true`,
    ]);
  });

  it("returns the tree with the values that visit returns", () => {
    const root = mapLeaves(system().root, pick, (leaf) => leaf.values.map((each) => each * 2));
    const read = JSON.stringify(root);

    expect(read).toContain(JSON.stringify(vector(0, 20, 0)));
    expect(read).toContain(JSON.stringify(number(80)));
    expect(read).toContain(JSON.stringify(number(5)));
  });
});

describe("leafEdits", () => {
  it("returns one grouped edit with a float write for a number", () => {
    const [edit, ...rest] = leafEdits(system().entry, system().root, pick, (leaf) =>
      leaf.values.map((each) => each * 2),
    );
    if (edit?.kind !== "editProperties") throw new Error("not one grouped edit");

    expect(rest).toEqual([]);
    expect(edit.edits.map((each) => [each.field, each.edits.length])).toEqual([
      [nameHash("birthVelocity"), 3],
      [nameHash("mCutoff"), 1],
    ]);
    expect(edit.edits[1]?.edits[0]).toEqual({
      type: "setLeaf",
      path: "",
      value: { type: "float", value: 80 },
    });
  });

  it("returns no edit if visit leaves each value equal", () => {
    expect(leafEdits(system().entry, system().root, pick, (leaf) => leaf.values)).toEqual([]);
  });
});

const RED = [1, 0, 0, 1];
const GRAY = [0.5, 0.5, 0.5, 1];

function close(values: readonly number[]): number[] {
  return values.map((each) => Math.round(each * 1000) / 1000);
}

function fieldsOf(system: ReturnType<typeof systemOf>, adjust = NO_ADJUST): string[] {
  return adjustEdits(system, adjust).flatMap((edit) =>
    edit.kind === "editProperties" ? edit.edits.map((each) => each.field) : [],
  );
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

describe("adjustEdits", () => {
  it("turns the tints and skips the channel mixer", () => {
    const system = systemOf([
      field("color", curve("ValueColor", vector(...RED), [vector(...RED), vector(...GRAY)])),
      field(
        "reflectionDefinition",
        struct("VfxReflectionDefinitionData", [field("fresnelColor", vector(0, 0, 1, 1))]),
      ),
      field(
        "alphaErosionDefinition",
        struct("VfxAlphaErosionDefinitionData", [
          field("erosionMapChannelMixer", curve("ValueColor", vector(1, 0, 0, 0))),
        ]),
      ),
    ]);

    expect(fieldsOf(system, { hue: 120, scale: 1 })).toEqual([
      nameHash("color"),
      nameHash("fresnelColor"),
    ]);
  });

  it("scales birthScale0 and leaves scale0 if the emitter sets both", () => {
    const system = systemOf([
      field("birthScale0", curve("ValueVector3", vector(50, 50, 50))),
      field("scale0", curve("ValueVector3", vector(1, 2, 1))),
      field("birthVelocity", curve("ValueVector3", vector(0, 100, 0))),
      field("birthRotation0", curve("ValueVector3", vector(0, 90, 0))),
    ]);

    expect(fieldsOf(system, { hue: 0, scale: 2 })).toEqual([
      nameHash("birthScale0"),
      nameHash("birthVelocity"),
    ]);
  });

  it("scales scale0 if the emitter sets no birthScale0", () => {
    const system = systemOf([field("scale0", curve("ValueVector3", vector(30, 30, 30)))]);

    expect(fieldsOf(system, { hue: 0, scale: 2 })).toEqual([nameHash("scale0")]);
  });

  it("returns no color edit for a scale alone", () => {
    const system = systemOf([field("color", curve("ValueColor", vector(0.3, 0.7, 0.1, 1)))]);

    expect(adjustEdits(system, { hue: 0, scale: 2 })).toEqual([]);
  });

  it("returns no edit for no adjustment", () => {
    const system = systemOf([field("color", curve("ValueColor", vector(...RED)))]);

    expect(adjustEdits(system, NO_ADJUST)).toEqual([]);
  });
});
