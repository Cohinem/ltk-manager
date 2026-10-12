import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import { list } from "../../engine/drivers/__tests__/driverFixture";
import {
  addChildEdits,
  boneEdits,
  boneModeEdits,
  moveChildEdits,
  removeChildEdits,
} from "../childEdits";
import { authored, childSet, hex, identifier, SMOKE, SPARKS, text } from "./childFixture";

const CHILDREN = hex("childrenIdentifiers");
const BONES = hex("boneToSpawnAt");

const SET_POINTER = {
  type: "ensurePointer",
  path: "",
  class: "VfxChildParticleSetDefinitionData",
};
const NEW_BONE = {
  type: "insertItem",
  path: BONES,
  item: { index: null, key: null, class: null },
};
const BONE_LIST = { type: "ensureProperty", path: "", field: nameHash("boneToSpawnAt") };

const TWO = [identifier("effect", SPARKS), identifier("effect", SMOKE)];
const picked = authored(childSet(TWO));
const boned = authored(childSet(TWO, { boneToSpawnAt: list(text("Head"), text("Root")) }));

describe("addChildEdits", () => {
  it("writes the set, the list and a linked identifier on an emitter with no set", () => {
    expect(addChildEdits(authored(null), { naming: "link", entry: "0x00000011" })).toEqual([
      SET_POINTER,
      { type: "ensureProperty", path: "", field: nameHash("childrenIdentifiers") },
      {
        type: "insertItem",
        path: CHILDREN,
        item: { index: null, key: null, class: "VfxChildIdentifier" },
      },
      { type: "ensureProperty", path: `${CHILDREN}[0]`, field: nameHash("effect") },
      {
        type: "setLeaf",
        path: `${CHILDREN}[0].${hex("effect")}`,
        value: { type: "objectLink", text: "0x00000011" },
      },
    ]);
  });

  it("writes an effect key on the identifier after the set's existing children", () => {
    const edits = addChildEdits(picked, { naming: "key", key: "0x000000bb" });

    expect(edits.slice(3)).toEqual([
      { type: "ensureProperty", path: `${CHILDREN}[2]`, field: nameHash("effectKey") },
      {
        type: "setLeaf",
        path: `${CHILDREN}[2].${hex("effectKey")}`,
        value: { type: "hash", text: "0x000000bb" },
      },
    ]);
  });

  it("adds an empty bone for the child of a bone set", () => {
    const edits = addChildEdits(boned, { naming: "link", entry: "0x00000011" });

    expect(edits.slice(5)).toEqual([BONE_LIST, NEW_BONE]);
  });
});

describe("removeChildEdits", () => {
  it("removes the identifier alone where the set writes no bone for it", () => {
    expect(removeChildEdits(picked, 1)).toEqual([{ type: "removeItem", path: `${CHILDREN}[1]` }]);
  });

  it("removes the child's bone with it", () => {
    expect(removeChildEdits(boned, 1)).toEqual([
      { type: "removeItem", path: `${CHILDREN}[1]` },
      { type: "removeItem", path: `${BONES}[1]` },
    ]);
  });
});

describe("moveChildEdits", () => {
  it("copies a child one place up and removes the original below the copy", () => {
    expect(moveChildEdits(picked, 1, 0)).toEqual([
      { type: "copyItem", from: `${CHILDREN}[1]`, path: CHILDREN, index: 0, unique: null },
      { type: "removeItem", path: `${CHILDREN}[2]` },
    ]);
  });

  it("copies a child one place down past its neighbour and removes the original", () => {
    expect(moveChildEdits(picked, 0, 1)).toEqual([
      { type: "copyItem", from: `${CHILDREN}[0]`, path: CHILDREN, index: 2, unique: null },
      { type: "removeItem", path: `${CHILDREN}[0]` },
    ]);
  });

  it("moves the bone with the child of a bone set", () => {
    expect(moveChildEdits(boned, 1, 0).slice(2)).toEqual([
      { type: "copyItem", from: `${BONES}[1]`, path: BONES, index: 0, unique: null },
      { type: "removeItem", path: `${BONES}[2]` },
    ]);
  });
});

describe("boneModeEdits", () => {
  it("writes an empty bone for every child of the set", () => {
    expect(boneModeEdits(picked)).toEqual([SET_POINTER, BONE_LIST, NEW_BONE, NEW_BONE]);
  });

  it("writes one bone for a set with no child, so the set reads as a bone set", () => {
    expect(boneModeEdits(authored(null))).toEqual([SET_POINTER, BONE_LIST, NEW_BONE]);
  });
});

describe("boneEdits", () => {
  it("sets the bone of a child the list already reaches", () => {
    expect(boneEdits(boned, 1, "Weapon")).toEqual([
      BONE_LIST,
      { type: "setLeaf", path: `${BONES}[1]`, value: { type: "string", value: "Weapon" } },
    ]);
  });

  it("grows the list with empty bones up to the child", () => {
    const short = authored(childSet(TWO, { boneToSpawnAt: list(text("Head")) }));

    expect(boneEdits(short, 1, "Root")).toEqual([
      BONE_LIST,
      NEW_BONE,
      { type: "setLeaf", path: `${BONES}[1]`, value: { type: "string", value: "Root" } },
    ]);
  });
});
