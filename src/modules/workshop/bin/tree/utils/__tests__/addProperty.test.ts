import { describe, expect, it } from "vitest";

import type { AddableField } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import {
  fieldWire,
  matchingFields,
  parseTypedField,
  propertyOf,
  suggestionsFor,
} from "../addProperty";

function field(name: string, overrides: Partial<AddableField> = {}): AddableField {
  return {
    hash: nameHash(name),
    name,
    shape: { kind: "f32", key: null, value: null },
    classHash: null,
    class: null,
    inheritedFrom: null,
    ...overrides,
  };
}

const FIELDS = [field("birthScale"), field("scale"), field("materialOverride")];

describe("a typed field", () => {
  it("reads name: kind the way ritobin writes one", () => {
    expect(parseTypedField("mySpeed: f32")).toEqual({
      kind: "custom",
      field: "mySpeed",
      shape: { kind: "f32", key: null, value: null },
      class: null,
    });
    expect(parseTypedField("tags: list[hash]")?.shape).toEqual({
      kind: "list",
      key: null,
      value: "hash",
    });
    expect(parseTypedField("names : map[hash, string]")?.shape).toEqual({
      kind: "map",
      key: "hash",
      value: "string",
    });
    expect(parseTypedField("mesh: embed = SkinMeshDataProperties")).toMatchObject({
      shape: { kind: "embed" },
      class: "SkinMeshDataProperties",
    });
    expect(parseTypedField("parts: list2[embed] = Part")?.class).toBe("Part");
  });

  it("reads nothing out of text of another shape", () => {
    for (const text of [
      "scale",
      "scale:",
      "scale: float",
      "items: list",
      "names: map[hash]",
      "size: u8 = Part",
      "mesh: embed",
      ": f32",
    ]) {
      expect(parseTypedField(text), text).toBeNull();
    }
  });
});

describe("what the add line suggests", () => {
  it("matches a name anywhere and lists a prefix match first", () => {
    expect(matchingFields(FIELDS, "scale").map((each) => each.name)).toEqual([
      "scale",
      "birthScale",
    ]);
    expect(matchingFields(FIELDS, "")).toHaveLength(3);
  });

  it("leads with a typed field, and drops it where a declared field has its name", () => {
    const typed = suggestionsFor(FIELDS, "myScale: u8");
    expect(typed[0]).toMatchObject({ kind: "custom", field: "myScale" });

    const shadowed = suggestionsFor(FIELDS, "scale: u8");
    expect(shadowed.every((each) => each.kind === "declared")).toBe(true);
  });

  it("sends a declared field by its hash and a typed one as written", () => {
    const [declared] = suggestionsFor(FIELDS, "material");
    expect(declared && propertyOf(declared)).toEqual({
      kind: "declared",
      field: nameHash("materialOverride"),
    });

    const custom = parseTypedField("0x0000002a: u32");
    expect(custom && fieldWire(custom)).toBe("0000002a");
    const named = parseTypedField("mySpeed: f32");
    expect(named && fieldWire(named)).toBe(nameHash("mySpeed").slice(2));
  });
});
