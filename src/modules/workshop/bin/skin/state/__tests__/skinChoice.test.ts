import { describe, expect, it } from "vitest";

import { overriddenHidden } from "../skinChoice";

describe("overriddenHidden", () => {
  it("answers the list itself while the reader has chosen nothing", () => {
    const hidden = ["Wings"];

    expect(overriddenHidden(hidden, new Map())).toBe(hidden);
  });

  it("shows a submesh the reader showed, whatever case the list spells it in", () => {
    expect(overriddenHidden(["Wings", "Cape"], new Map([["wings", true]]))).toEqual(["Cape"]);
  });

  it("hides a submesh the reader hid, once", () => {
    expect(overriddenHidden(["Cape"], new Map([["hat", false]]))).toEqual(["Cape", "hat"]);
    expect(overriddenHidden(["Hat"], new Map([["hat", false]]))).toEqual(["Hat"]);
  });
});
