import { describe, expect, it } from "vitest";

import { socketedPose } from "@/modules/viewport";

import { socketModelsOf } from "../dynamicsModel";
import { jointSlot } from "../skinScene";
import { POSE, ref, SKELETON, socket, unnamed } from "./fixtures";

const JOINTS = SKELETON.joints.length;

describe("jointSlot", () => {
  it("finds a joint the tables name by that name, in any case", () => {
    expect(jointSlot(POSE, ref("hair_1"))).toBe(2);
  });

  it("finds a joint no table names by the hash of its name", () => {
    expect(jointSlot(POSE, unnamed("Hair_1"))).toBe(2);
  });

  it("answers no slot for a hash no joint holds, and for no reference", () => {
    expect(jointSlot(POSE, unnamed("Gone"))).toBe(-1);
    expect(jointSlot(POSE, null)).toBe(-1);
  });

  it("finds a socket of a socketed pose by its hash, past the last joint", () => {
    const sockets = [socket(0, "Tip", ref("Hair_2")), socket(1, "Crown", ref("Root"))];
    const pose = socketedPose(POSE, socketModelsOf(sockets, POSE));

    expect(jointSlot(pose, unnamed("Crown"))).toBe(JOINTS + 1);
  });

  it("answers the joint for a socket a joint of its name shadows", () => {
    const sockets = [socket(0, "Hair_1", ref("Root"))];
    const pose = socketedPose(POSE, socketModelsOf(sockets, POSE));

    expect(jointSlot(pose, unnamed("Hair_1"))).toBe(2);
  });

  it("answers no slot for a socket whose joint the skeleton lacks", () => {
    const sockets = [socket(0, "Adrift", ref("Gone"))];
    const pose = socketedPose(POSE, socketModelsOf(sockets, POSE));

    expect(jointSlot(pose, unnamed("Adrift"))).toBe(-1);
  });
});
