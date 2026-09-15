import { describe, expect, it } from "vitest";

import { completeClassTerm, splitClassTerm } from "../classTerm";

describe("splitClassTerm", () => {
  it("reads nothing out of a query holding no class term", () => {
    expect(splitClassTerm("smolder skin0")).toBeNull();
    expect(splitClassTerm("")).toBeNull();
  });

  it("cuts the term away and joins the rest by one space", () => {
    expect(splitClassTerm("class:skinchar smolder   skin0")).toEqual({
      value: "skinchar",
      last: false,
      rest: "smolder skin0",
    });
  });

  it("says when the term was the last one typed", () => {
    expect(splitClassTerm("smolder class:skinchar")).toEqual({
      value: "skinchar",
      last: true,
      rest: "smolder",
    });
    expect(splitClassTerm("class:")).toEqual({ value: "", last: true, rest: "" });
  });

  it("reads the key in any case and takes the first of two", () => {
    expect(splitClassTerm("Class:Vfx class:skin")).toEqual({
      value: "Vfx",
      last: false,
      rest: "class:skin",
    });
  });
});

describe("completeClassTerm", () => {
  it("writes the class out in place of the term, ready for a path term", () => {
    expect(completeClassTerm("class:skin", "SkinCharacterDataProperties")).toBe(
      "class:SkinCharacterDataProperties ",
    );
  });

  it("keeps the terms around it as typed", () => {
    expect(completeClassTerm("smolder class:skin", "SkinCharacterDataProperties")).toBe(
      "smolder class:SkinCharacterDataProperties ",
    );
    expect(completeClassTerm("class:skin smolder", "SkinCharacterDataProperties")).toBe(
      "class:SkinCharacterDataProperties smolder",
    );
  });

  it("replaces the last class term when the query holds two", () => {
    expect(completeClassTerm("class:vfx class:skin", "SkinCharacterDataProperties")).toBe(
      "class:vfx class:SkinCharacterDataProperties ",
    );
  });

  it("reads the key in any case", () => {
    expect(completeClassTerm("CLASS:Skin", "SkinCharacterDataProperties")).toBe(
      "class:SkinCharacterDataProperties ",
    );
  });

  it("adds the term to a query that holds none", () => {
    expect(completeClassTerm("smolder", "SkinCharacterDataProperties")).toBe(
      "smolder class:SkinCharacterDataProperties ",
    );
    expect(completeClassTerm("", "SkinCharacterDataProperties")).toBe(
      "class:SkinCharacterDataProperties ",
    );
  });

  it("completes a bare key", () => {
    expect(completeClassTerm("class:", "VfxSystemDefinitionData")).toBe(
      "class:VfxSystemDefinitionData ",
    );
  });
});
