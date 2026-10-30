import { describe, expect, it } from "vitest";

import { fixNote } from "../fixCopy";

describe("fixNote", () => {
  it("states the removal of another skin's audio for the skinhack rule", () => {
    expect(fixNote("bin/skinhack")).toBe(
      "Repair removes the bank units and the tags of another skin. The base skin's audio plays in their place.",
    );
  });

  it("returns null if the catalog has no note for the fix of the rule", () => {
    expect(fixNote("bin/property-type")).toBeNull();
  });
});
