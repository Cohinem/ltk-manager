import { describe, expect, it } from "vitest";

import { matchesOverrideFilter, serializeDraft, validateEntries } from "../draft";
import type { OverrideEntry } from "../types";

let idCounter = 0;

function entry(key: string, value = ""): OverrideEntry {
  idCounter += 1;
  return { id: `ov-${idCounter}`, key, value };
}

describe("validateEntries", () => {
  it("passes a clean list", () => {
    const entries = [entry("aas-hour-2", "Two hours"), entry("aas-hour-3", "Three hours")];
    expect(validateEntries(entries)).toEqual({});
  });

  it("flags an empty key", () => {
    const blank = entry("   ");
    expect(validateEntries([blank])).toEqual({ [blank.id]: "Field name cannot be empty" });
  });

  it("flags the later duplicate, not the first occurrence", () => {
    const first = entry("aas-hour-2");
    const second = entry("aas-hour-2");
    const errors = validateEntries([first, second]);
    expect(errors[first.id]).toBeUndefined();
    expect(errors[second.id]).toBe("Duplicate field name");
  });

  it("treats keys differing only in case as duplicates, as the game does", () => {
    const first = entry("AAS-Hour-2");
    const second = entry("aas-hour-2 ");
    const errors = validateEntries([first, second]);
    expect(errors[second.id]).toBe("Duplicate field name");
  });
});

describe("matchesOverrideFilter", () => {
  const row = entry("game_character_displayname_ahri", "Fox Spirit");

  it("keeps every row for a blank query", () => {
    expect(matchesOverrideFilter(row, undefined, "")).toBe(true);
    expect(matchesOverrideFilter(row, undefined, "   ")).toBe(true);
  });

  it("matches the key and the replacement, case-insensitively", () => {
    expect(matchesOverrideFilter(row, undefined, "AHRI")).toBe(true);
    expect(matchesOverrideFilter(row, undefined, "fox sp")).toBe(true);
    expect(matchesOverrideFilter(row, undefined, "annie")).toBe(false);
  });

  it("matches the current in-game text when the index knows it", () => {
    expect(matchesOverrideFilter(row, "the Nine-Tailed Fox", "nine-tailed")).toBe(true);
    expect(matchesOverrideFilter(row, undefined, "nine-tailed")).toBe(false);
  });

  it("keeps a row with an emptied key on screen, since it carries the error", () => {
    expect(matchesOverrideFilter(entry("  ", "Fox Spirit"), undefined, "annie")).toBe(true);
  });
});

describe("serializeDraft", () => {
  it("reads the same whatever order the rows hold", () => {
    const a = entry("aas-hour-2", "Two hours");
    const b = entry("game_character_displayname_ahri", "Fox Spirit");
    expect(serializeDraft([a, b])).toBe(serializeDraft([b, a]));
  });

  it("ignores unkeyed rows and trims the keys it keeps", () => {
    const kept = entry(" aas-hour-2 ", "Two hours");
    const blank = entry("   ", "half-made");
    expect(serializeDraft([kept, blank])).toBe(serializeDraft([entry("aas-hour-2", "Two hours")]));
  });

  it("tells a value change apart from no change", () => {
    expect(serializeDraft([entry("k", "a")])).not.toBe(serializeDraft([entry("k", "b")]));
    expect(serializeDraft([entry("k", "a")])).toBe(serializeDraft([entry("k", "a")]));
  });
});
