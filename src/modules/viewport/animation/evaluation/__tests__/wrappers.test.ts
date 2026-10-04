import { describe, expect, it } from "vitest";

import type { JointModel, SkeletonModel, Vec3 } from "../../../assets/parsing/skeletonBuffer";
import type { SocketModel } from "../../../dynamics/sockets";
import type { Take } from "../../../dynamics/take";
import { createPose } from "../pose";
import { simulatedPose } from "../simulatedPose";
import { isSocketed, socketedPose } from "../socketedPose";

function joint(name: string, parent: number, translation: Vec3): JointModel {
  return {
    name,
    hash: 0,
    parent,
    translation,
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    inverseBind: new Float32Array(16),
  };
}

const SKELETON: SkeletonModel = {
  joints: [
    joint("Root", -1, [0, 100, 0]),
    joint("Head", 0, [0, 50, 0]),
    joint("Hair", 1, [0, 0, -10]),
  ],
  influences: Uint32Array.of(0, 1, 2),
};

function placeOf(world: Float32Array): number[] {
  return Array.from(world.subarray(12, 15), (value) => Math.round(value * 1e4) / 1e4 + 0);
}

function socket(over: Partial<Extract<SocketModel, { kind: "singleJoint" }>>): SocketModel {
  return {
    kind: "singleJoint",
    name: "HeadTop",
    parent: 1,
    position: [0, 12, 0],
    rotation: [0, 0, 0],
    freezePosition: [false, false, false],
    freezeRotation: [false, false, false],
    ...over,
  };
}

/** One frame that drops the hair four units under where the bind pose holds it. */
const DROPPED: Take = {
  frames: 1,
  duration: 1,
  slots: Int32Array.of(2),
  locals: Float32Array.of(0, -4, -10, 0, 0, 0, 1),
};

describe("simulatedPose", () => {
  const world = (pose: ReturnType<typeof simulatedPose>, slot: number) =>
    placeOf(pose.worldInto(slot, 0, new Float32Array(16)));

  it("is its base until a take is set", () => {
    const pose = simulatedPose(createPose(SKELETON, null));

    expect(pose.take).toBeNull();
    expect(world(pose, 2)).toEqual([0, 150, -10]);
  });

  it("reads the joints a take holds from the take, and composes them under the base", () => {
    const pose = simulatedPose(createPose(SKELETON, null));

    pose.setTake(DROPPED);

    expect(world(pose, 2)).toEqual([0, 146, -10]);
    expect(world(pose, 1)).toEqual([0, 150, 0]);
  });

  it("answers a swapped take at a time it has already answered", () => {
    const pose = simulatedPose(createPose(SKELETON, null));

    pose.setTake(DROPPED);
    expect(world(pose, 2)).toEqual([0, 146, -10]);

    pose.setTake(null);
    expect(world(pose, 2)).toEqual([0, 150, -10]);
  });

  it("reads live joints in place of the take, composes them again once touched, and lets them go", () => {
    const pose = simulatedPose(createPose(SKELETON, null));
    pose.setTake(DROPPED);

    /* The hair is the third joint, at ten floats a joint. */
    const locals = new Float32Array(30);
    locals.set([0, 6, -10, 0, 0, 0, 1], 20);
    pose.setLive({ slots: Int32Array.of(2), locals });
    expect(world(pose, 2)).toEqual([0, 156, -10]);
    expect(world(pose, 1)).toEqual([0, 150, 0]);

    locals[21] = 9;
    pose.touch();
    expect(world(pose, 2)).toEqual([0, 159, -10]);

    pose.setLive(null);
    expect(world(pose, 2)).toEqual([0, 146, -10]);
  });
});

describe("socketedPose", () => {
  const base = createPose(SKELETON, null);
  const world = (pose: ReturnType<typeof socketedPose>, slot: number) =>
    placeOf(pose.worldInto(slot, 0, new Float32Array(16)));

  it("is the pose itself for no socket", () => {
    expect(socketedPose(base, [])).toBe(base);
  });

  it("answers a socket by name, without regard to case, as a slot past the last joint", () => {
    const pose = socketedPose(base, [socket({})]);

    const slot = pose.jointNamed("headtop");

    expect(slot).toBe(3);
    expect(world(pose, slot)).toEqual([0, 162, 0]);
    expect(pose.skeleton).toBe(SKELETON);
  });

  it("lets a joint win over a socket of its name, and the first socket over a later one", () => {
    const pose = socketedPose(base, [
      socket({ name: "Head" }),
      socket({ name: "Top", position: [0, 1, 0] }),
      socket({ name: "top", position: [0, 2, 0] }),
    ]);

    expect(pose.jointNamed("Head")).toBe(1);
    expect(world(pose, pose.jointNamed("Top"))).toEqual([0, 151, 0]);
    expect(isSocketed(pose) && [0, 1, 2].map((index) => pose.socketSlot(index))).toEqual([
      -1, 4, -1,
    ]);
  });

  it("answers no slot for a socket whose joint is missing, without falling through", () => {
    const pose = socketedPose(base, [
      socket({ name: "Top", parent: -1 }),
      socket({ name: "Top", parent: 1 }),
    ]);

    expect(pose.jointNamed("Top")).toBe(-1);
  });

  it("follows the pose it wraps, so a socket on a simulated joint follows the simulation", () => {
    const simulated = simulatedPose(base);
    simulated.setTake(DROPPED);

    const pose = socketedPose(simulated, [
      socket({ name: "HairTip", parent: 2, position: [0, 0, 0] }),
    ]);

    expect(world(pose, pose.jointNamed("HairTip"))).toEqual([0, 146, -10]);
  });

  it("stands a world socket its offset from the origin", () => {
    const pose = socketedPose(base, [{ kind: "world", name: "Overhead", position: [0, 200, 0] }]);

    expect(world(pose, pose.jointNamed("Overhead"))).toEqual([0, 200, 0]);
  });
});
