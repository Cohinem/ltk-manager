import { describe, expect, it } from "vitest";

import type { FixAlternative } from "@/lib/tauri";

import { alternativeCopy } from "../alternativeCopy";

function conversion(over: Partial<FixAlternative> = {}): FixAlternative {
  return {
    id: "convert",
    experimental: true,
    fix: { before: "134", after: "145" },
    ...over,
  };
}

describe("alternativeCopy", () => {
  it("states the zeroed attenuation flag if the conversion reports it", () => {
    const copy = alternativeCopy(
      "audio/bank-version",
      conversion({ caveats: ["attenuationFlagZeroed"] }),
    );

    expect(copy.title).toBe("Convert to version 145");
    expect(copy.note).toContain("attenuation flag");
  });

  it("states no attenuation flag if the conversion reports no caveat", () => {
    const copy = alternativeCopy("audio/bank-version", conversion());

    expect(copy.note).toBe("Rewritten at version 145. The events keep their IDs.");
  });

  it("falls back to the id if the catalog has no copy for the alternative", () => {
    expect(alternativeCopy("bin/property-type", conversion())).toEqual({
      title: "convert",
      note: null,
    });
  });
});
