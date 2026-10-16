import { describe, expect, it } from "vitest";

import type { NodeAddress, Problem } from "@/lib/tauri";

import { indexProblems, locationKey } from "../problemGroups";

const FILE = "Ahri.wad.client/data/skin3.bin";

function problem(id: string, node: NodeAddress | null = null): Problem {
  return {
    id,
    rule: "bin/base-skin-copy",
    severity: "warning",
    site: { layer: "base", path: FILE, node },
    fix: null,
  };
}

function ids(problems: readonly Problem[] | undefined): string[] {
  return (problems ?? []).map(({ id }) => id);
}

describe("indexProblems", () => {
  const index = indexProblems([
    problem("file"),
    problem("field", { entry: "0x00000001", path: "0x00000002" }),
  ]);

  it("keys every problem of a file under the file and each directory above it", () => {
    for (const path of [FILE, "Ahri.wad.client/data", "Ahri.wad.client"]) {
      expect(ids(index.paths.get(locationKey("base", path)))).toEqual(["file", "field"]);
    }
  });

  it("keys a node problem under its row and under its object row", () => {
    const row = (key: string) => ids(index.rows.get(locationKey("base", FILE, key)));

    expect(row("0x00000001:0x00000002")).toEqual(["field"]);
    expect(row("0x00000001:")).toEqual(["field"]);
  });

  it("keeps layers apart", () => {
    expect(index.paths.get(locationKey("chroma", "Ahri.wad.client"))).toBeUndefined();
  });
});
