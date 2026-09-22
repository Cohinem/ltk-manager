import { expect, it } from "vitest";

import type { ObjectDeclaration, ObjectDirListing } from "@/lib/tauri";

import { buildObjectTree, objectListingNodes } from "../objectTree";

it("shares identities and declaration order across tree and grid without loading descendants", () => {
  const first: ObjectDeclaration = {
    asset: { kind: "gameChunk", wad: "test", pathHash: "file" },
    file: "skin.bin",
    class: "Skin",
    classHash: "class",
  };
  const override: ObjectDeclaration = {
    ...first,
    asset: { kind: "layer", project: "project", layer: "base", path: "skin.bin" },
  };
  const listing: ObjectDirListing = {
    prefixes: [{ path: "characters", name: "characters", count: 2 }],
    objects: [
      { path: "skin", name: "skin", objectHash: "object", declarations: [first], count: 1 },
    ],
  };
  const layers = new Map([
    ["object", [{ declaration: override, layer: { name: "base", title: "Base" } }]],
  ]);

  const grid = objectListingNodes(listing, layers);
  const tree = buildObjectTree(new Map([["", listing]]), () => false, layers);
  expect(grid).toEqual(tree);
  expect(grid[1]).toMatchObject({ declarations: [first, override], count: 1, children: [] });
});
