import { describe, expect, it } from "vitest";

import type { FieldSchema, PropertyKind } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { FIELD, JOINT_TREES, TREE_GROUPS } from "../dynamicsFields";
import { dynamicsFields, dynamicsLabel } from "../dynamicsLabels";

function field(name: string, kind: PropertyKind | null, hash = nameHash(name)): FieldSchema {
  return {
    hash,
    name,
    declared: kind === null ? null : { kind, key: null, value: null },
    classHash: null,
    defaultValue: null,
    owner: null,
    revisions: [],
  };
}

function names(fields: readonly FieldSchema[]): (string | null)[] {
  return fields.map((each) => each.name);
}

describe("dynamicsLabel", () => {
  it("reads a field the tables name as its name in words", () => {
    expect(dynamicsLabel(nameHash("AnimPoseAttraction"), "AnimPoseAttraction")).toBe(
      "Anim Pose Attraction",
    );
  });

  it("names a field no table names", () => {
    expect(dynamicsLabel(FIELD.colliderFile, FIELD.colliderFile)).toBe("Collider File");
    expect(dynamicsLabel(FIELD.restLengthFromPose, FIELD.restLengthFromPose)).toBe(
      "Rest Length From Pose",
    );
    expect(dynamicsLabel(FIELD.tipsWithoutRadius, FIELD.tipsWithoutRadius)).toBe(
      "Tips Without Radius",
    );
  });

  it("says what a spring's switch does to the joint", () => {
    expect(dynamicsLabel(FIELD.doTranslation, "DoTranslation")).toBe("Follow Movement");
  });

  it("leaves an unnamed field it has no words for to the row", () => {
    expect(dynamicsLabel("0x12345678", "0x12345678")).toBeUndefined();
  });
});

describe("dynamicsFields", () => {
  it("leaves out a field the installed build does not declare", () => {
    const drawn = dynamicsFields("", [field("Damping", "f32"), field("DampingStart", null)]);

    expect(names(drawn)).toEqual(["Damping"]);
  });

  it("draws a group's trees first and its embeds after its plain fields", () => {
    const drawn = dynamicsFields("", [
      field("ChainProperties", "embed"),
      field("GenerateLateralLinks", "bool"),
      field("JointTrees", "list2", JOINT_TREES),
    ]);

    expect(names(drawn)).toEqual(["JointTrees", "GenerateLateralLinks", "ChainProperties"]);
  });

  it("draws a chain's groups last", () => {
    const drawn = dynamicsFields("", [
      field("JointTreeGroups", "list2", TREE_GROUPS),
      field("PhysicsSimLocalSettings", "embed"),
      field("DefaultOn", "bool"),
    ]);

    expect(names(drawn)).toEqual(["DefaultOn", "PhysicsSimLocalSettings", "JointTreeGroups"]);
  });
});
