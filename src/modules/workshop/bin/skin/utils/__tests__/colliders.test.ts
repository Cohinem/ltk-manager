import { describe, expect, it } from "vitest";

import type { SkinModel } from "@/lib/tauri";
import { createPose, type JointModel, type SkeletonModel } from "@/modules/viewport";

import {
  bindPoint,
  capsuleMate,
  colliderPathOf,
  NO_SHAPES,
  offsetFrom,
  pointAt,
  shapesOf,
  withCapsule,
  withCapsuleAt,
  withoutCapsule,
  withoutSphere,
  withSphere,
  withSphereAt,
} from "../colliders";

function joint(name: string, parent: number, y: number): JointModel {
  return {
    name,
    hash: 0,
    parent,
    translation: [0, y, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    inverseBind: new Float32Array(16),
  };
}

const SKELETON: SkeletonModel = {
  joints: [joint("Root", -1, 100), joint("Neck", 0, 30), joint("Head", 1, 10)],
  influences: Uint32Array.of(0, 1, 2),
};
const POSE = createPose(SKELETON, null);

function skinAt(skeleton: string | null): SkinModel {
  return {
    skeleton: skeleton === null ? null : { path: skeleton, asset: null },
  } as SkinModel;
}

describe("colliderPathOf", () => {
  it("names the file beside the skeleton, under the skeleton's name", () => {
    expect(colliderPathOf(skinAt("ASSETS/Characters/Ahri/Skins/Base/Ahri_Base.skl"))).toBe(
      "ASSETS/Characters/Ahri/Skins/Base/Ahri_Base.colliders",
    );
  });

  it("names none for a skin with no skeleton, and for a skeleton with no path", () => {
    expect(colliderPathOf(skinAt(null))).toBeNull();
    expect(colliderPathOf(skinAt("d75eaa93edbefae8"))).toBeNull();
  });
});

describe("bindPoint", () => {
  it("answers where a joint stands in the bind pose, in the model's space", () => {
    expect(bindPoint(POSE, 2)).toEqual([0, 140, 0]);
  });
});

describe("adding and removing shapes", () => {
  it("stands a new sphere where its joint stands", () => {
    const file = withSphere(NO_SHAPES, POSE, 2);

    expect(file.spheres).toEqual([{ joint: "Head", centre: [0, 140, 0], radius: 10 }]);
    expect(NO_SHAPES.spheres).toEqual([]);
  });

  it("runs a new capsule from one joint to the other", () => {
    const file = withCapsule(NO_SHAPES, POSE, 2, 1);

    expect(file.capsules).toEqual([
      {
        jointA: "Head",
        endA: [0, 140, 0],
        radiusA: 6,
        jointB: "Neck",
        endB: [0, 130, 0],
        radiusB: 6,
      },
    ]);
  });

  it("changes one shape and leaves the others", () => {
    const two = withSphere(withSphere(NO_SHAPES, POSE, 2), POSE, 1);

    const changed = withSphereAt(two, 1, { radius: 4 });

    expect(changed.spheres.map((sphere) => sphere.radius)).toEqual([10, 4]);
    expect(
      withCapsuleAt(withCapsule(NO_SHAPES, POSE, 2, 1), 0, { radiusB: 9 }).capsules[0],
    ).toEqual(expect.objectContaining({ radiusA: 6, radiusB: 9 }));
  });

  it("removes a shape by its place in the file", () => {
    const two = withSphere(withSphere(NO_SHAPES, POSE, 2), POSE, 1);

    expect(withoutSphere(two, 0).spheres.map((sphere) => sphere.joint)).toEqual(["Neck"]);
    expect(withoutCapsule(withCapsule(NO_SHAPES, POSE, 2, 1), 0).capsules).toEqual([]);
  });
});

describe("capsuleMate", () => {
  it("is the selected joint, for a joint that is neither it nor its child", () => {
    expect(capsuleMate(POSE, 0, 2, -1)).toBe(2);
    expect(capsuleMate(POSE, 2, 0, -1)).toBe(0);
  });

  it("is the joint selected before, for the selected joint itself", () => {
    expect(capsuleMate(POSE, 2, 2, 0)).toBe(0);
    expect(capsuleMate(POSE, 2, 2, -1)).toBe(-1);
  });

  it("is none where the menu already names the joint as the parent", () => {
    expect(capsuleMate(POSE, 2, 1, -1)).toBe(-1);
    expect(capsuleMate(POSE, 2, 2, 1)).toBe(-1);
  });

  it("is none with no joint selected", () => {
    expect(capsuleMate(POSE, 1, -1, -1)).toBe(-1);
  });
});

describe("offsetFrom and pointAt", () => {
  it("measure a point off its joint, and stand a point off its joint", () => {
    expect(offsetFrom(POSE, "Head", [1, 145, -2])).toEqual([1, 5, -2]);
    expect(pointAt(POSE, "Head", [1, 5, -2])).toEqual([1, 145, -2]);
  });

  it("measure from the origin for a joint the skeleton lacks", () => {
    expect(offsetFrom(POSE, "Tail", [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("shapesOf", () => {
  it("copies every shape, so the save command takes nothing the file still holds", () => {
    const file = withCapsule(withSphere(NO_SHAPES, POSE, 2), POSE, 2, 1);

    const shapes = shapesOf(file);

    expect(shapes).toEqual({ spheres: file.spheres, capsules: file.capsules });
    expect(shapes.spheres[0]).not.toBe(file.spheres[0]);
    expect(shapes.spheres[0].centre).not.toBe(file.spheres[0].centre);
    expect(shapes.capsules[0].endA).not.toBe(file.capsules[0].endA);
    expect(shapes.capsules[0].endB).not.toBe(file.capsules[0].endB);
  });
});
