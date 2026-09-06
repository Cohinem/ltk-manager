// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { REFERENCES_DOCUMENT_ID, referencesDocument } from "../../documents/contentDocument";
import { classReferences, objectReferences } from "../useFindReferences";

describe("referencesDocument", () => {
  /* One project answers one question at a time, so a second Find all references
     replaces the answer in the tab already open rather than adding another. */
  it("keys on nothing, so every question lands in one tab", () => {
    expect(referencesDocument()).toEqual({ id: REFERENCES_DOCUMENT_ID, kind: "references" });
    expect(referencesDocument().id).toBe(referencesDocument().id);
  });
});

describe("classReferences", () => {
  it("asks for the class and reads by its name", () => {
    expect(classReferences("0x9b67e9f6", "SkinCharacterDataProperties")).toEqual({
      query: { kind: "class", classHash: "0x9b67e9f6" },
      label: "SkinCharacterDataProperties",
    });
  });

  it("reads by the hash where no table names the class", () => {
    expect(classReferences("0x9b67e9f6", null).label).toBe("0x9b67e9f6");
  });
});

describe("objectReferences", () => {
  it("asks for the object and reads by its path", () => {
    expect(objectReferences("0x2a1f3c7d", "characters/aatrox/skins/skin0")).toEqual({
      query: { kind: "object", objectHash: "0x2a1f3c7d" },
      label: "characters/aatrox/skins/skin0",
    });
  });
});
