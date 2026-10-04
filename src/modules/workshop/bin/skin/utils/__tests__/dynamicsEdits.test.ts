import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import {
  addModifierEdits,
  addSocketEdits,
  addSpringEdits,
  excludeJointEdits,
  meshPath,
  parameterCurveEdits,
  relative,
  setLeafEdits,
  simulateFromEdits,
  socketName,
  takenNames,
  under,
} from "../dynamicsEdits";
import { GROUPS, group, HAIR, MESH, MODIFIERS, POSE, skin, TREES } from "./fixtures";

describe("the staged edits", () => {
  it("writes every path relative to the mesh properties", () => {
    expect(relative(`${MESH}.abc[0]`)).toBe("abc[0]");
    expect(relative(MESH)).toBe("");
  });

  it("reads a relative path back as a path of the skin object", () => {
    expect(meshPath("abc[0]")).toBe(`${MESH}.abc[0]`);
    expect(meshPath("")).toBe(MESH);
    expect(meshPath(under("", "0x0000abcd"))).toBe(`${MESH}.0000abcd`);
    expect(under("abc[0]", "0x0000abcd")).toBe("abc[0].0000abcd");
  });

  it("gives a skin with no chain a chain, a group and a tree rooted on the joint", () => {
    const edits = simulateFromEdits(skin(), "Hair_Root", { kind: "newChain" });

    expect(edits.map((edit) => edit.type)).toEqual([
      "ensureProperty",
      "insertItem",
      "ensureProperty",
      "insertItem",
      "ensureProperty",
      "insertItem",
      "ensureProperty",
      "setLeaf",
    ]);
    expect(edits.at(-1)).toMatchObject({
      value: { type: "hash", text: "Hair_Root" },
    });
    expect(edits[1]).toMatchObject({
      item: { index: 0, class: "DynamicsChainRigPoseModifierData" },
    });
  });

  it("adds a second tree to a group after the trees it holds", () => {
    const held = group(0, [{ root: "Hair_Root" }]);

    const edits = simulateFromEdits(HAIR, "L_Pauldron", {
      kind: "group",
      group: held,
    });

    expect(edits[1]).toMatchObject({
      type: "insertItem",
      path: `${relative(held.path)}.${TREES}`,
      item: { index: 1, class: "DynamicsJointTreeData" },
    });
  });

  it("adds a new modifier past the last one the skin lists", () => {
    const edits = addSpringEdits(HAIR, "Hair_Root");

    expect(edits[1]).toMatchObject({
      item: { index: 2, class: "SpringPhysicsRigPoseModifierData" },
    });
  });

  it("adds a modifier of any class past the last one, at its defaults", () => {
    expect(addModifierEdits(HAIR, "JointOrientationRigPoseModifierData")).toEqual([
      { type: "ensureProperty", path: "", field: nameHash("rigPoseModifierData") },
      {
        type: "insertItem",
        path: nameHash("rigPoseModifierData").slice(2),
        item: { index: 2, key: null, class: "JointOrientationRigPoseModifierData" },
      },
    ]);
  });

  it("excludes a joint at the head of a tree's list", () => {
    const edits = excludeJointEdits(`${MODIFIERS}[0].${GROUPS}[0].${TREES}[0]`, "Hair_Clip");

    expect(edits.at(-1)).toMatchObject({
      type: "setLeaf",
      value: { type: "hash", text: "Hair_Clip" },
    });
    expect(edits.at(-1)?.path.endsWith("[0]")).toBe(true);
  });

  it("sets a leaf under the fields above it, adding each the file leaves out", () => {
    const fields = [nameHash("ChainProperties"), nameHash("Damping"), nameHash("value")];
    const edits = setLeafEdits(`${MODIFIERS}[0].${GROUPS}[0]`, fields, {
      type: "float",
      value: 0.25,
    });

    expect(edits.map((edit) => edit.type)).toEqual([
      "ensureProperty",
      "ensureProperty",
      "ensureProperty",
      "setLeaf",
    ]);
    expect(edits.at(-1)).toMatchObject({
      value: { type: "float", value: 0.25 },
    });
  });

  it("gives a parameter a flat curve when its curve is turned on without one", () => {
    const at = `${MODIFIERS}[0].${GROUPS}[0]`;

    const without = parameterCurveEdits(at, "radius", true, false);
    const withOne = parameterCurveEdits(at, "radius", true, true);
    const off = parameterCurveEdits(at, "radius", false, false);

    expect(without.some((edit) => edit.type === "ensurePointer")).toBe(true);
    expect(without.filter((edit) => edit.type === "insertItem")).toHaveLength(4);
    expect(withOne.some((edit) => edit.type === "ensurePointer")).toBe(false);
    expect(off.at(-1)).toMatchObject({ value: { type: "bool", value: false } });
  });

  it("adds a new socket past the last one the skin lists", () => {
    const edits = addSocketEdits(HAIR, "Hair_2", "Hair_2_Socket");

    expect(edits[1]).toMatchObject({
      item: { index: 1, class: "SocketDefinitionSingleJoint" },
    });
  });
});

describe("socketName and takenNames", () => {
  it("names a new socket for its joint, apart from every joint and socket", () => {
    expect(socketName("Head", new Set(["head"]))).toBe("Head_Socket");
    expect(socketName("Head", new Set(["head_socket", "head_socket2"]))).toBe("Head_Socket3");
  });

  it("takes the name of every joint and every socket, in lower case", () => {
    const taken = takenNames(POSE, HAIR.sockets);

    expect(taken.has("hair_root")).toBe(true);
    expect(taken.has("hairtip")).toBe(true);
    expect(taken.has("HairTip")).toBe(false);
    expect(taken.size).toBe(POSE.skeleton.joints.length + 1);
  });
});
