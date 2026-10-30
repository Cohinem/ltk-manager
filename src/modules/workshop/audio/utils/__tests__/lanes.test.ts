import { describe, expect, it } from "vitest";

import { rowLanes } from "../lanes";

function row(key: string, parent: string | null) {
  return { key, parent };
}

describe("rowLanes", () => {
  it("ends each lane on the last row of its block, nested lanes included", () => {
    const lanes = rowLanes([
      row("e1", null),
      row("g1", "e1"),
      row("v1", "g1"),
      row("g2", "g1"),
      row("v2", "g2"),
      row("add", "e1"),
      row("e2", null),
    ]);

    expect(lanes).toEqual([
      { blocks: [], ends: [] },
      { blocks: ["e1"], ends: [false] },
      { blocks: ["e1", "g1"], ends: [false, false] },
      { blocks: ["e1", "g1"], ends: [false, false] },
      { blocks: ["e1", "g1", "g2"], ends: [false, true, true] },
      { blocks: ["e1"], ends: [true] },
      { blocks: [], ends: [] },
    ]);
  });

  it("ends every lane of the last row of the list", () => {
    expect(rowLanes([row("e1", null), row("g1", "e1"), row("v1", "g1")]).at(-1)).toEqual({
      blocks: ["e1", "g1"],
      ends: [true, true],
    });
  });
});
