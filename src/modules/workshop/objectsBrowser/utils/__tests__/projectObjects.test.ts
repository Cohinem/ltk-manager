import { describe, expect, it } from "vitest";

import type { ContentTree, ObjectDirListing } from "@/lib/tauri";

import {
  holdsProjectObjects,
  type ProjectObject,
  projectOnlyObjects,
  withProjectListings,
  withProjectObjects,
} from "../projectObjects";

const EMPTY: ObjectDirListing = { prefixes: [], objects: [] };

function own(path: string, objectHash = `0x${path.length.toString(16).padStart(8, "0")}`) {
  return { objectHash, path } satisfies ProjectObject;
}

function unnamed(objectHash: string): ProjectObject {
  return { objectHash, path: objectHash };
}

function installed(path: string, count = 0) {
  return {
    objectHash: `0xaa${path.length.toString(16).padStart(6, "0")}`,
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    declarations: [],
    count,
  };
}

function prefix(path: string, name: string, count: number) {
  return { path, name, count };
}

describe("projectOnlyObjects", () => {
  const tree = {
    layers: [
      {
        name: "base",
        entries: [
          {
            relativePath: "data/skin.bin",
            objects: [
              { objectHash: "0x00000001", path: "Characters/Ahri/Skins/Skin0" },
              { objectHash: "0x00000002", path: "Characters/Ahri/Skins/Skin0/Particles/Mine" },
              { objectHash: "0x00000003", path: "0X00000003" },
            ],
          },
        ],
      },
      {
        name: "chroma",
        entries: [
          {
            relativePath: "data/skin.bin",
            objects: [
              { objectHash: "0x00000002", path: "Characters/Ahri/Skins/Skin0/Particles/Mine" },
            ],
          },
        ],
      },
    ],
  } as unknown as ContentTree;

  it("keeps the objects the install does not declare, once each, a hash spelled as its hash", () => {
    expect(projectOnlyObjects(tree, new Set(["0x00000001"]))).toEqual([
      { objectHash: "0x00000002", path: "Characters/Ahri/Skins/Skin0/Particles/Mine" },
      { objectHash: "0x00000003", path: "0x00000003" },
    ]);
  });

  it("holds nothing for a project that is not scanned yet", () => {
    expect(projectOnlyObjects(undefined, new Set())).toEqual([]);
  });
});

describe("withProjectObjects", () => {
  it("returns the install's listing itself where the project adds nothing under the prefix", () => {
    const listing: ObjectDirListing = { prefixes: [prefix("Maps", "Maps", 4)], objects: [] };

    expect(withProjectObjects("Maps", listing, [own("Characters/Ahri/Mine")])).toBe(listing);
  });

  it("adds an object beside the install's, in name order, with no declarations of its own", () => {
    const listing: ObjectDirListing = {
      prefixes: [],
      objects: [installed("A/Particles/Alpha"), installed("A/Particles/Gamma")],
    };

    const merged = withProjectObjects("A/Particles", listing, [own("A/Particles/Beta", "0x01")]);

    expect(merged.objects.map((entry) => entry.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(merged.objects[1]).toEqual({
      objectHash: "0x01",
      path: "A/Particles/Beta",
      name: "Beta",
      declarations: [],
      count: 0,
    });
  });

  it("counts the objects added below an install prefix and below an install object", () => {
    const listing: ObjectDirListing = {
      prefixes: [prefix("A/Particles", "Particles", 10)],
      objects: [installed("A/Skin0", 3)],
    };

    const merged = withProjectObjects("A", listing, [
      own("A/Particles/Mine"),
      own("A/Skin0/Resources2"),
      own("A/Skin0/Extra/Deep"),
    ]);

    expect(merged.prefixes).toEqual([prefix("A/Particles", "Particles", 11)]);
    expect(merged.objects[0]?.count).toBe(5);
  });

  it("keeps a folded install prefix where the added objects all sit under its end", () => {
    const listing: ObjectDirListing = {
      prefixes: [prefix("Characters/Ahri/Skins", "Characters/Ahri/Skins", 40)],
      objects: [],
    };

    const merged = withProjectObjects("", listing, [own("Characters/Ahri/Skins/Skin9")]);

    expect(merged.prefixes).toEqual([prefix("Characters/Ahri/Skins", "Characters/Ahri/Skins", 41)]);
  });

  it("cuts a folded install prefix back to where an added object branches off", () => {
    const listing: ObjectDirListing = {
      prefixes: [prefix("Characters/Ahri/Skins", "Characters/Ahri/Skins", 40)],
      objects: [],
    };

    const merged = withProjectObjects("", listing, [own("Characters/Ahri/Spells/Mine")]);

    expect(merged.prefixes).toEqual([prefix("Characters/Ahri", "Characters/Ahri", 41)]);
  });

  it("stops a fold at the node an added object sits directly under", () => {
    const listing: ObjectDirListing = {
      prefixes: [prefix("Characters/Ahri/Skins", "Characters/Ahri/Skins", 40)],
      objects: [],
    };

    const merged = withProjectObjects("", listing, [own("Characters/Ahri")]);

    expect(merged.prefixes).toEqual([prefix("Characters", "Characters", 41)]);
  });

  it("turns an install prefix an added object sits at into that object's row", () => {
    const listing: ObjectDirListing = {
      prefixes: [prefix("A/Skin0/Particles", "Skin0/Particles", 7)],
      objects: [],
    };

    const merged = withProjectObjects("A", listing, [own("A/Skin0", "0x09"), own("A/Skin0/Mine")]);

    expect(merged.prefixes).toEqual([]);
    expect(merged.objects).toEqual([
      { objectHash: "0x09", path: "A/Skin0", name: "Skin0", declarations: [], count: 8 },
    ]);
  });

  it("builds a prefix the install does not hold, folded through its single-child run", () => {
    const merged = withProjectObjects("", EMPTY, [
      own("Characters/Mine/Skins/Skin0"),
      own("Characters/Mine/Skins/Skin1"),
    ]);

    expect(merged.prefixes).toEqual([prefix("Characters/Mine/Skins", "Characters/Mine/Skins", 2)]);
    expect(
      withProjectObjects("Characters/Mine/Skins", EMPTY, [
        own("Characters/Mine/Skins/Skin0"),
        own("Characters/Mine/Skins/Skin1", "0x02"),
      ]).objects.map((entry) => entry.name),
    ).toEqual(["Skin0", "Skin1"]);
  });

  it("adds the unnamed to their group, and the group to a root that has none, last", () => {
    const root: ObjectDirListing = { prefixes: [prefix("Maps", "Maps", 4)], objects: [] };
    const objects = [unnamed("0x000000aa"), own("Zed/Mine")];

    const merged = withProjectObjects("", root, objects);
    expect(merged.prefixes).toEqual([
      prefix("Maps", "Maps", 4),
      prefix("Zed", "Zed", 1),
      prefix("?", "?", 1),
    ]);

    const counted = withProjectObjects(
      "",
      { prefixes: [prefix("?", "?", 9)], objects: [] },
      objects,
    );
    expect(counted.prefixes.at(-1)).toEqual(prefix("?", "?", 10));

    const group = withProjectObjects("?", EMPTY, objects);
    expect(group.objects).toEqual([
      {
        objectHash: "0x000000aa",
        path: "0x000000aa",
        name: "0x000000aa",
        declarations: [],
        count: 0,
      },
    ]);
  });
});

describe("withProjectListings", () => {
  it("merges the root and each loaded listing, and leaves a loading one loading", () => {
    const objects = [own("A/Mine")];
    const listings = new Map<string, ObjectDirListing | null>([
      ["A", EMPTY],
      ["B", null],
    ]);

    const all = withProjectListings(EMPTY, listings, objects);

    expect(all.get("")?.prefixes).toEqual([prefix("A", "A", 1)]);
    expect(all.get("A")?.objects.map((entry) => entry.name)).toEqual(["Mine"]);
    expect(all.get("B")).toBeNull();
  });
});

describe("holdsProjectObjects", () => {
  it("answers for a prefix above an object, and for the unnamed group alone for a hash", () => {
    const objects = [own("A/B/Mine"), unnamed("0x000000aa")];

    expect(holdsProjectObjects("A", objects)).toBe(true);
    expect(holdsProjectObjects("A/B/Mine", objects)).toBe(false);
    expect(holdsProjectObjects("C", objects)).toBe(false);
    expect(holdsProjectObjects("?", objects)).toBe(true);
    expect(holdsProjectObjects("", [unnamed("0x000000aa")])).toBe(false);
  });
});
