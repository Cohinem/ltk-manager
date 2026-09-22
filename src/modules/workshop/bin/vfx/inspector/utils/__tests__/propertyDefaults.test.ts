import { describe, expect, it } from "vitest";

import type { BinRow, FieldSchema, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../../shared/utils/binHash";
import { componentHasDefaults, matchesDefault, rowHasDefault } from "../propertyDefaults";

function structure(fields: Record<string, VfxValue>, className = "ValueVector3"): VfxValue {
  return {
    type: "struct",
    classHash: nameHash(className),
    class: className,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, hash: nameHash(name), value })),
  };
}

function definition(name: string, defaultValue: string | null): FieldSchema {
  return {
    name,
    hash: nameHash(name),
    defaultValue,
    declared: { kind: "embed", key: null, value: null },
    classHash: nameHash("ValueVector3"),
    revisions: [],
  };
}

function row(name: string, value: BinRow["value"]): BinRow {
  return {
    entry: "0x00000001",
    path: `emitters[0].${nameHash(name).slice(2)}`,
    node: "property",
    name,
    label: name,
    unnamed: false,
    kind: null,
    declared: null,
    value,
  };
}

describe("inspector constructor equality", () => {
  it("recognizes explicit scalar, vector and empty defaults", () => {
    expect(
      rowHasDefault(
        row("bindWeight", { type: "float", value: 1 }),
        [definition("bindWeight", "1")],
        null,
      ),
    ).toBe(true);
    expect(
      rowHasDefault(
        row("rotationOverride", { type: "vector", values: [0, 0, 0] }),
        [definition("rotationOverride", "[0,0,0]")],
        null,
      ),
    ).toBe(true);
    expect(
      rowHasDefault(
        row("CustomMaterial", { type: "null" }),
        [definition("CustomMaterial", "null")],
        null,
      ),
    ).toBe(true);
    expect(
      rowHasDefault(
        row("materialOverrideDefinitions", { type: "container", len: 0, itemKind: "embed" }),
        [definition("materialOverrideDefinitions", "[]")],
        null,
      ),
    ).toBe(true);
  });

  it("compares at f32 precision without treating nearby edits as defaults", () => {
    expect(matchesDefault({ type: "number", value: Math.fround(0.1) }, 0.1)).toBe(true);
    expect(matchesDefault({ type: "number", value: Math.fround(0.100001) }, 0.1)).toBe(false);
    expect(matchesDefault({ type: "number", value: null }, 0)).toBe(false);
  });

  it("keeps unknown, mismatched and nonempty unread values expanded", () => {
    const value = row("scale0", {
      type: "struct",
      classHash: nameHash("ValueVector3"),
      class: "ValueVector3",
      len: 1,
    });
    expect(rowHasDefault(value, undefined, null)).toBe(false);
    expect(rowHasDefault(value, [definition("scale0", null)], null)).toBe(false);
    expect(
      rowHasDefault(
        value,
        [definition("scale0", '{"constantValue":[1,1,1],"dynamics":null}')],
        null,
      ),
    ).toBe(false);

    const scalar = row("bindWeight", { type: "float", value: 1 });
    scalar.declared = { shape: { kind: "f32", key: null, value: null }, mismatch: true };
    expect(rowHasDefault(scalar, [definition("bindWeight", "1")], null)).toBe(false);
  });

  it("compares sparse embedded constants against the property constructor", () => {
    const value = structure({ constantValue: { type: "vector", values: [1, 1, 1] } });
    const expected = { constantValue: [1, 1, 1], dynamics: null };
    expect(matchesDefault(value, expected)).toBe(true);

    const holder = structure({ scale0: value }, "VfxEmitterDefinitionData");
    expect(
      rowHasDefault(
        row("scale0", { type: "undrawn" }),
        [definition("scale0", JSON.stringify(expected))],
        holder,
      ),
    ).toBe(true);
  });

  it("keeps animation and unknown authored fields visible even when the constant is default", () => {
    const expected = { constantValue: [1, 1, 1], dynamics: null };
    const constantValue: VfxValue = { type: "vector", values: [1, 1, 1] };
    expect(matchesDefault(structure({ constantValue, dynamics: structure({}) }), expected)).toBe(
      false,
    );
    expect(
      matchesDefault(
        structure({ constantValue, unknown: { type: "bool", value: false } }),
        expected,
      ),
    ).toBe(false);
    expect(
      matchesDefault(structure({ constantValue: { type: "vector", values: [1, 2, 1] } }), expected),
    ).toBe(false);
  });

  it("does not conflate a different component class with a default instance", () => {
    const holder = structure({ scale0: structure({}, "DifferentClass") });
    expect(
      rowHasDefault(row("scale0", { type: "undrawn" }), [definition("scale0", "{}")], holder),
    ).toBe(false);
  });

  it("folds empty and default components but preserves unknown authored data", () => {
    expect(componentHasDefaults(structure({}), undefined)).toBe(true);
    expect(
      componentHasDefaults(structure({ radius: { type: "number", value: 0 } }), [
        definition("radius", "0"),
      ]),
    ).toBe(true);
    expect(
      componentHasDefaults(structure({ radius: { type: "number", value: 5 } }), [
        definition("radius", "0"),
      ]),
    ).toBe(false);
    expect(
      componentHasDefaults(structure({ radius: { type: "number", value: 0 } }), undefined),
    ).toBe(false);
  });

  it("never compares nonempty containers by length alone", () => {
    expect(
      rowHasDefault(
        row("items", { type: "container", len: 1, itemKind: "f32" }),
        [definition("items", "[1]")],
        null,
      ),
    ).toBe(false);
    expect(matchesDefault({ type: "container", items: [{ type: "number", value: 2 }] }, [1])).toBe(
      false,
    );
  });
});
