import { describe, expect, it } from "vitest";

import { changedRows, holdersOf } from "../useChanges";

describe("change keys", () => {
  it("lists every holder above a wire path, down from the object", () => {
    expect(holdersOf("0a0b0c0d[3].0e0f0a0b")).toEqual(["", "0a0b0c0d", "0a0b0c0d[3]"]);
    expect(holdersOf('0a0b0c0d{"a.b"}.0e0f0a0b')).toEqual(["", "0a0b0c0d", '0a0b0c0d{"a.b"}']);
    expect(holdersOf("")).toEqual([]);
  });

  it("keys each change by its row and marks the rows above it", () => {
    const { rows, within } = changedRows([
      { entry: "0x1", path: "0a0b0c0d[1].0e0f0a0b", kind: "changed" },
    ]);

    expect(rows.get("0x1:0a0b0c0d[1].0e0f0a0b")).toBe("changed");
    expect([...within]).toEqual(["0x1:", "0x1:0a0b0c0d", "0x1:0a0b0c0d[1]"]);
  });
});
