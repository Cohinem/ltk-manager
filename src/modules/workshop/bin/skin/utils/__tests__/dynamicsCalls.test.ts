import { describe, expect, it } from "vitest";

import type { SkinModel } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { declaredCalls } from "../dynamicsCalls";
import {
  addModifierEdits,
  addOrientationEdits,
  addOrientationJointEdits,
  addSpringEdits,
  excludeJointEdits,
  includeJointEdits,
  orientationSourceEdits,
  removeEdits,
  setLeafEdits,
  simulateFromEdits,
} from "../dynamicsEdits";
import { MESH_PROPERTIES } from "../dynamicsFields";

const MESH = MESH_PROPERTIES.slice(2);
const MODIFIERS = nameHash("rigPoseModifierData").slice(2);
const GROUPS = nameHash("JointTreeGroups").slice(2);
const TREES = nameHash("JointTrees").slice(2);
const ROOT = nameHash("RootJointName").slice(2);
const JOINT = nameHash("Joint").slice(2);

/** A skin holding `count` pose modifiers the preview does not simulate. */
function skinWith(count: number): SkinModel {
  return {
    poseModifiers: Array.from({ length: count }, (_, at) => ({
      kind: "other",
      path: `${MESH}.${MODIFIERS}[${at}]`,
      class: "ConformToPathRigPoseModifierData",
    })),
    sockets: [],
  } as unknown as SkinModel;
}

describe("declaredCalls", () => {
  it("takes an item out by one removal", () => {
    expect(declaredCalls(removeEdits(`${MESH}.${MODIFIERS}[3]`))).toEqual([
      { kind: "remove", path: `${MODIFIERS}[3]` },
    ]);
    expect(declaredCalls(includeJointEdits(`${MESH}.${MODIFIERS}[3]`, 1))).toHaveLength(1);
  });

  it("names the deepest property a leaf is set under", () => {
    const group = `${MESH}.${MODIFIERS}[3].${GROUPS}[0]`;
    const fields = [nameHash("ChainProperties"), nameHash("Damping"), nameHash("value")];

    const calls = declaredCalls(setLeafEdits(group, fields, { type: "float", value: 0.25 }));

    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({
      kind: "property",
      holder: `${MODIFIERS}[3].${GROUPS}[0]`,
      field: fields[0],
    });
    const edits = calls?.[0].kind === "property" ? calls[0].edits : [];
    expect(edits.map((edit) => edit.path)).toEqual([
      "",
      fields[1].slice(2),
      `${fields[1].slice(2)}.${fields[2].slice(2)}`,
    ]);
  });

  it("sets a list the action owns as one property", () => {
    const tree = `${MESH}.${MODIFIERS}[3].${GROUPS}[0].${TREES}[0]`;

    const calls = declaredCalls(excludeJointEdits(tree, "Hair3"));

    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({
      kind: "property",
      holder: tree.slice(MESH.length + 1),
    });
    const edits = calls?.[0].kind === "property" ? calls[0].edits : [];
    expect(edits.map((edit) => edit.path)).toEqual(["", "[0]"]);
  });

  it("adds to a list of the game's and fills the new item field by field", () => {
    const calls = declaredCalls(addSpringEdits(skinWith(11), "Hair3"));

    expect(calls?.map((call) => call.kind)).toEqual(["append", "property", "property"]);
    expect(calls?.[0]).toMatchObject({ list: MODIFIERS, item: { index: 11 } });
    expect(calls?.[1]).toMatchObject({
      holder: `${MODIFIERS}[11]`,
      field: `0x${JOINT}`,
    });
    const edits = calls?.[1].kind === "property" ? calls[1].edits : [];
    expect(edits).toEqual([{ type: "setLeaf", path: "", value: { type: "hash", text: "Hair3" } }]);
  });

  it("fills a new chain's groups as one property of the chain", () => {
    const calls = declaredCalls(simulateFromEdits(skinWith(11), "Hair1", { kind: "newChain" }));

    expect(calls?.map((call) => call.kind)).toEqual(["append", "property"]);
    expect(calls?.[1]).toMatchObject({
      holder: `${MODIFIERS}[11]`,
      field: `0x${GROUPS}`,
    });
    const edits = calls?.[1].kind === "property" ? calls[1].edits : [];
    expect(edits.at(-1)).toMatchObject({
      type: "setLeaf",
      path: `[0].${TREES}[0].${ROOT}`,
    });
  });

  it("sets the whole list where the list holds nothing of the game's", () => {
    const calls = declaredCalls(addSpringEdits(skinWith(0), "Hair3"));

    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({
      kind: "property",
      holder: "",
      field: `0x${MODIFIERS}`,
    });
  });

  it("names no call for edits that start on no property", () => {
    expect(
      declaredCalls([{ type: "setLeaf", path: "a", value: { type: "bool", value: true } }]),
    ).toBeNull();
    expect(declaredCalls([])).toEqual([]);
  });
});

describe("declaredCalls over the pose modifiers a pane adds", () => {
  const JOINTS = nameHash("Joints");
  const SOURCE = nameHash("OrientationSource");
  const orientation = `${MESH}.${MODIFIERS}[2]`;

  it("adds a modifier of any class to a list that holds items as one addition", () => {
    expect(
      declaredCalls(addModifierEdits(skinWith(2), "VertexAnimationRigPoseModifierData")),
    ).toEqual([
      {
        kind: "append",
        list: MODIFIERS,
        item: { index: 2, key: null, class: "VertexAnimationRigPoseModifierData" },
      },
    ]);
  });

  it("writes the list a first modifier makes as one property", () => {
    const calls = declaredCalls(addModifierEdits(skinWith(0), "JointSnapRigPoseModifilerData"));

    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({
      kind: "property",
      holder: "",
      field: nameHash("rigPoseModifierData"),
    });
  });

  it("adds an orientation and its first joint as an addition and one property of it", () => {
    const calls = declaredCalls(addOrientationEdits(skinWith(2), "Head"));

    expect(calls?.map((call) => call.kind)).toEqual(["append", "property"]);
    expect(calls?.[1]).toMatchObject({ holder: `${MODIFIERS}[2]`, field: JOINTS });
    const edits = calls?.[1].kind === "property" ? calls[1].edits : [];
    expect(edits.map((edit) => [edit.type, edit.path])).toEqual([
      ["insertItem", ""],
      ["setLeaf", "[0]"],
    ]);
  });

  it("adds a joint to an orientation, and sets and clears its source, as one property each", () => {
    const joint = declaredCalls(
      addOrientationJointEdits(orientation, "Head", [`${orientation}.x[0]`]),
    );
    expect(joint).toHaveLength(1);
    expect(joint?.[0]).toMatchObject({
      kind: "property",
      holder: `${MODIFIERS}[2]`,
      field: JOINTS,
    });

    for (const className of ["0x19da44b2", null]) {
      expect(declaredCalls(orientationSourceEdits(orientation, className))).toEqual([
        {
          kind: "property",
          holder: `${MODIFIERS}[2]`,
          field: SOURCE,
          edits: [{ type: "replacePointer", path: "", class: className }],
        },
      ]);
    }
  });
});
