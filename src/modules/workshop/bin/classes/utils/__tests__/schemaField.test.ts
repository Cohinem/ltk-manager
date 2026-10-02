import { describe, expect, it } from "vitest";

import type { FieldRevision, FieldSchema } from "@/lib/tauri";

import { defaultText, earlierType, sameWords } from "../schemaField";

describe("defaultText", () => {
  it("reads a value family as its constant", () => {
    expect(defaultText('{"constantValue": 3.0, "dynamics": null}', null)).toEqual({
      text: "3",
      rgba: null,
    });
  });

  it("reads a colour value family as its channels and a swatch", () => {
    expect(
      defaultText('{"constantValue": [1.0, 0.5, 0.0, 1.0], "dynamics": null}', "unit"),
    ).toEqual({ text: "1, 0.5, 0, 1", rgba: [1, 0.5, 0, 1] });
  });

  it("scales a byte colour to a swatch", () => {
    expect(defaultText("[255, 0, 0, 255]", "byte")?.rgba).toEqual([1, 0, 0, 1]);
  });

  it("writes leaves as the row does", () => {
    expect(defaultText("0.25", null)?.text).toBe("0.25");
    expect(defaultText("false", null)?.text).toBe("false");
    expect(defaultText('""', null)?.text).toBe('""');
    expect(defaultText("[1.0, 1.0, 1.0]", null)?.text).toBe("1, 1, 1");
  });

  it("has no line for a struct, a pointer, a container or an absent option", () => {
    for (const json of ["{}", '{"mesh": 1}', "null", "[]", '[{"a": 1}]']) {
      expect(defaultText(json, null)).toBeNull();
    }
  });
});

describe("sameWords", () => {
  it("reads a label that only recases or spaces the name as the same words", () => {
    expect(sameWords("Importance", "importance")).toBe(true);
    expect(sameWords("Mesh", "mMesh")).toBe(true);
    expect(sameWords("Birth Scale", "birthScale")).toBe(true);
  });

  it("reads a label with other words as another name", () => {
    expect(sameWords("Initial Rotation", "birthRotation0")).toBe(false);
    expect(sameWords("Emission Rate", "rate")).toBe(false);
    expect(sameWords("Material", "mask")).toBe(false);
  });
});

describe("earlierType", () => {
  const revision = (
    from: number,
    kind: "string" | "file",
    patch: string | null,
  ): FieldRevision => ({
    from,
    to: null,
    patch,
    shape: { kind, key: null, value: null },
  });

  const field = (revisions: FieldRevision[]): FieldSchema => ({
    hash: "0x10537b0c",
    name: "mIconFileName",
    declared: revisions.at(-1)?.shape ?? null,
    classHash: null,
    defaultValue: null,
    owner: null,
    revisions,
  });

  it("names the type a retyped field had and the patch it changed at", () => {
    expect(earlierType(field([revision(1, "string", null), revision(2, "file", "16.17")]))).toEqual(
      {
        tag: "string",
        patch: "16.17",
      },
    );
  });

  it("says nothing for a field that kept its type", () => {
    expect(earlierType(field([revision(1, "file", null)]))).toBeNull();
    expect(
      earlierType(field([revision(1, "file", null), revision(2, "file", "16.17")])),
    ).toBeNull();
  });
});
