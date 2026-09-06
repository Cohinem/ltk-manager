import { describe, expect, it } from "vitest";

import type { ReferenceGroup, ReferenceHit } from "@/lib/tauri";

import {
  buildReferenceTree,
  countReferences,
  flattenReferences,
  type ReferenceFileNode,
} from "../referenceTree";

function hit(path: string, cls: string | null = "SkinCharacterDataProperties"): ReferenceHit {
  const hash = `0x${path.length.toString(16).padStart(8, "0")}`;
  return {
    objectHash: hash,
    path,
    classHash: "0x9b67e9f6",
    class: cls ?? "0x9b67e9f6",
  };
}

function group(file: string, objects: ReferenceHit[]): ReferenceGroup {
  return {
    asset: { kind: "gameChunk", wad: "Champions/Aatrox.wad.client", pathHash: file },
    file,
    objects,
  };
}

const GROUPS: ReferenceGroup[] = [
  group("data/skins.bin", [
    hit("characters/aatrox/skins/skin0"),
    hit("characters/aatrox/skins/skin10"),
  ]),
  group("data/ahri.bin", [hit("characters/ahri/skins/skin0")]),
];

describe("buildReferenceTree", () => {
  it("gives one file row over the objects it declares, in the order the backend grouped them", () => {
    const files = buildReferenceTree(GROUPS);

    expect(files.map((file) => file.file)).toEqual(["data/skins.bin", "data/ahri.bin"]);
    expect(files[0]!.children.map((object) => object.path)).toEqual([
      "characters/aatrox/skins/skin0",
      "characters/aatrox/skins/skin10",
    ]);
  });

  it("splits an object's path into the name it reads by and the prefix above it", () => {
    const object = buildReferenceTree(GROUPS)[0]!.children[0]!;

    expect(object.name).toBe("skin0");
    expect(object.prefix).toBe("characters/aatrox/skins");
    expect(object.unnamed).toBe(false);
  });

  it("keys a row on its file and its object, so one object in two files is two rows", () => {
    const shared = hit("characters/shared");
    const files = buildReferenceTree([group("a.bin", [shared]), group("b.bin", [shared])]);

    const ids = files.flatMap((file) => file.children.map((object) => object.id));
    expect(new Set(ids).size).toBe(2);
  });

  it("carries the declaring file down to the row that opens it", () => {
    const object = buildReferenceTree(GROUPS)[1]!.children[0]!;

    expect(object.file).toBe("data/ahri.bin");
    expect(object.asset).toEqual(GROUPS[1]!.asset);
  });

  /* The card takes a null name where no table named the class, the way every other
     class control does. */
  it("reads a class no table names as no name at all", () => {
    const files = buildReferenceTree([group("a.bin", [hit("characters/aatrox", null)])]);

    expect(files[0]!.children[0]!.class).toBeNull();
    expect(files[0]!.children[0]!.classHash).toBe("0x9b67e9f6");
  });

  it("reads an object no table names as unnamed, its hash standing in for a path", () => {
    const unnamed: ReferenceHit = {
      objectHash: "0x0000dead",
      path: "0x0000dead",
      classHash: "0x9b67e9f6",
      class: "SkinCharacterDataProperties",
    };
    const object = buildReferenceTree([group("a.bin", [unnamed])])[0]!.children[0]!;

    expect(object.unnamed).toBe(true);
    expect(object.name).toBe("0x0000dead");
    expect(object.prefix).toBe("");
  });
});

describe("flattenReferences", () => {
  const files = buildReferenceTree(GROUPS);
  const open = () => false;

  it("walks a file and then its objects, one level down", () => {
    const rows = flattenReferences(files, open);

    expect(rows.map((row) => [row.node.type, row.depth])).toEqual([
      ["file", 0],
      ["object", 1],
      ["object", 1],
      ["file", 0],
      ["object", 1],
    ]);
  });

  it("leaves out the objects of a file that is shut", () => {
    const shut = (node: ReferenceFileNode) => node.file === "data/skins.bin";
    const rows = flattenReferences(files, shut);

    expect(rows.map((row) => row.node.id)).toEqual([
      files[0]!.id,
      files[1]!.id,
      files[1]!.children[0]!.id,
    ]);
  });
});

describe("countReferences", () => {
  it("counts the objects of every group", () => {
    expect(countReferences(GROUPS)).toBe(3);
  });

  it("counts nothing for an answer with no group", () => {
    expect(countReferences([])).toBe(0);
  });
});
