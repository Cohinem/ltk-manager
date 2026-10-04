import { describe, expect, it } from "vitest";

import type { PoseModifier, Socket } from "@/lib/tauri";
import { buildDynamics, socketedPose } from "@/modules/viewport";

import type { TimedStep } from "../clipEvents";
import {
  AIM_STAND_IN,
  dynamicsCues,
  dynamicsModelOf,
  jointLabel,
  jointRoles,
  jointTree,
  parameterTint,
  socketModelsOf,
} from "../dynamicsModel";
import {
  chain,
  group,
  GROUPS,
  HAIR,
  MODIFIERS,
  orientation,
  POSE,
  ref,
  SKELETON,
  skin,
  socket,
  SOCKETS,
  spring,
  TREES,
  unnamed,
} from "./fixtures";

/** `POSE` answering a socket named `Tip` on the hair's tip, under the slot past the last joint. */
function socketed() {
  return socketedPose(POSE, socketModelsOf([socket(0, "Tip", ref("Hair_2"))], POSE));
}

describe("dynamicsModelOf", () => {
  it("finds each joint the tables name on the skeleton", () => {
    const model = dynamicsModelOf(HAIR, POSE);

    expect(model.chains[0].groups[0].trees).toEqual([{ root: 1, excluded: [3] }]);
    expect(model.springs[0].joint).toBe(5);
  });

  it("finds a joint no table names by its hash", () => {
    const held = group(0, [{ root: "Hair_Root" }]);
    const tree = { ...held.trees[0], root: unnamed("Hair_Root"), excluded: [unnamed("Hair_Clip")] };
    const model = dynamicsModelOf(
      skin({
        poseModifiers: [chain([{ ...held, trees: [tree] }]), spring(1, unnamed("L_Pauldron"))],
      }),
      POSE,
    );

    expect(model.chains[0].groups[0].trees).toEqual([{ root: 1, excluded: [3] }]);
    expect(model.springs[0].joint).toBe(5);
  });

  it("leaves a muted modifier out", () => {
    const model = dynamicsModelOf(HAIR, POSE, new Set([`${MODIFIERS}[0]`]));

    expect(model.chains).toEqual([]);
    expect(model.springs).toHaveLength(1);
  });
});

describe("socketModelsOf", () => {
  it("finds each socket's joint and passes over a kind it does not resolve", () => {
    const sockets: Socket[] = [
      socket(0, "HairTip", ref("Hair_2")),
      {
        kind: "other",
        path: `${SOCKETS}[1]`,
        name: "Odd",
        class: "0x00000001",
      },
      {
        kind: "world",
        path: `${SOCKETS}[2]`,
        name: "Overhead",
        position: [0, 200, 0],
      },
    ];

    const models = socketModelsOf(sockets, POSE);

    expect(models.map((each) => each.name)).toEqual(["HairTip", "Overhead"]);
    expect(models[0]).toMatchObject({ kind: "singleJoint", parent: 4 });
  });
});

describe("jointRoles", () => {
  it("marks the root, the joints under it, the excluded one, the spring and the socket's joint", () => {
    const roles = jointRoles(HAIR, POSE);

    expect(roles[1]).toMatchObject({ treeRoot: true, simulated: false });
    expect(roles[2]).toMatchObject({ simulated: true, excluded: false });
    expect(roles[3]).toMatchObject({ simulated: false, excluded: true });
    expect(roles[4]).toMatchObject({ simulated: true, sockets: 1 });
    expect(roles[5]).toMatchObject({ spring: true, simulated: false });
    expect(roles[0]).toMatchObject({
      treeRoot: false,
      simulated: false,
      spring: false,
    });
  });

  it("gives no role to a socket that a modifier or another socket names", () => {
    const onSocket = skin({
      poseModifiers: [chain([group(0, [{ root: "Tip" }])]), spring(1, ref("Tip"))],
      sockets: [socket(1, "Rider", ref("Tip"))],
    });

    const roles = jointRoles(onSocket, socketed());

    expect(roles).toHaveLength(SKELETON.joints.length);
    expect(roles.some((role) => role.treeRoot || role.spring || role.sockets > 0)).toBe(false);
  });
});

describe("jointTree", () => {
  it("answers the tree a joint stands under, and what the joint is to it", () => {
    expect(jointTree(HAIR, POSE, 1)).toMatchObject({
      root: true,
      excludedAt: -1,
    });
    expect(jointTree(HAIR, POSE, 3)).toMatchObject({
      root: false,
      excludedAt: 0,
    });
    expect(jointTree(HAIR, POSE, 4)?.tree.path).toBe(`${MODIFIERS}[0].${GROUPS}[0].${TREES}[0]`);
    expect(jointTree(HAIR, POSE, 5)).toBeNull();
  });
});

describe("jointLabel", () => {
  it("reads a joint as the skeleton spells it, whether or not the tables name the hash", () => {
    expect(jointLabel(POSE, ref("hair_1"))).toBe("Hair_1");
    expect(jointLabel(POSE, unnamed("Hair_1"))).toBe("Hair_1");
  });

  it("reads a socket found past the last joint as the socket's name", () => {
    expect(jointLabel(socketed(), unnamed("Tip"))).toBe("Tip");
  });

  it("reads a hash the pose holds nothing under as the tables call it", () => {
    expect(jointLabel(POSE, ref("Gone"))).toBe("Gone");
    expect(jointLabel(POSE, null)).toBeNull();
  });
});

describe("dynamicsModelOf over a joint orientation", () => {
  it("stands a place in for the driver and leaves out a joint the skeleton lacks", () => {
    const model = dynamicsModelOf(skin({ poseModifiers: [orientation(0)] }), POSE);

    expect(model.orientations).toEqual([
      {
        joints: [5],
        planeConstraint: 0,
        tiltAxis: 2,
        aimAxis: 1,
        aimNegated: true,
        flipped: true,
        maxAngle: 12,
        defaultOn: false,
        source: { vector: AIM_STAND_IN, position: true, rides: false },
      },
    ]);
  });

  it("gives an orientation with no driver no source, which turns nothing", () => {
    const held = skin({
      poseModifiers: [orientation(0, { source: null } as Partial<PoseModifier>)],
    });

    expect(dynamicsModelOf(held, POSE).orientations[0].source).toBeNull();
  });

  it("badges the joints an orientation turns", () => {
    const roles = jointRoles(skin({ poseModifiers: [orientation(0)] }), POSE);

    expect(roles.map((role) => role.orientation)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe("parameterTint", () => {
  it("tints each joint by the parameter's value along its tree, over the largest", () => {
    const model = dynamicsModelOf(HAIR, POSE);
    const rig = buildDynamics(model, SKELETON, POSE.parents, 1);

    const tint = parameterTint(HAIR, new Set(), rig, {
      group: `${MODIFIERS}[0].${GROUPS}[0]`,
      parameter: "damping",
    });

    /* The curve falls from the root to the tip, and the excluded joint takes no tint. */
    expect(Array.from(tint ?? [])).toEqual([0, 1, 0.5, 0, 0, 0]);
  });

  it("answers nothing for no parameter and for a group that is gone", () => {
    const rig = buildDynamics(dynamicsModelOf(HAIR, POSE), SKELETON, POSE.parents, 1);

    expect(parameterTint(HAIR, new Set(), rig, null)).toBeNull();
    expect(
      parameterTint(HAIR, new Set(), rig, {
        group: "gone",
        parameter: "damping",
      }),
    ).toBeNull();
  });
});

describe("dynamicsCues", () => {
  it("places each blend event on the pass by its step's frame length", () => {
    const step = {
      start: 1,
      frame: 0.1,
      clip: {
        events: [
          {
            startFrame: 5,
            endFrame: 15,
            kind: {
              kind: "dynamicsChainBlend",
              blendFromDefault: 0.2,
              blendToDefault: 0.3,
            },
          },
          {
            startFrame: 2,
            endFrame: null,
            kind: { kind: "springPhysics", spring: null },
          },
          { startFrame: 0, endFrame: null, kind: { kind: "other" } },
        ],
      },
    } as unknown as TimedStep;

    const cues = dynamicsCues([step]);

    expect(cues.chains).toEqual([{ at: 1.5, until: 2.5, blendFrom: 0.2, blendTo: 0.3 }]);
    expect(cues.springs).toEqual([{ at: 1.2, until: null, spring: null }]);
  });

  it("finds a lock's joint on the pose and takes an orientation event that blends", () => {
    const step = {
      start: 0,
      frame: 0.1,
      clip: {
        events: [
          {
            startFrame: 1,
            endFrame: 5,
            kind: { kind: "lockRootOrientation", joint: ref("Root"), blendOut: 0.3 },
          },
          {
            startFrame: null,
            endFrame: 20,
            kind: {
              kind: "jointOrientation",
              blendFromDefault: 0,
              blendToDefault: 0.2,
              overridesSource: false,
            },
          },
          {
            startFrame: null,
            endFrame: 18,
            kind: {
              kind: "jointOrientation",
              blendFromDefault: null,
              blendToDefault: null,
              overridesSource: true,
            },
          },
        ],
      },
    } as unknown as TimedStep;

    const cues = dynamicsCues([step], [], POSE);

    expect(cues.locks).toEqual([{ at: 0.1, until: 0.5, joint: 0, blendOut: 0.3 }]);
    expect(cues.orientations).toEqual([{ at: 0, until: 2, blendFrom: 0, blendTo: 0.2 }]);
    expect(dynamicsCues([step]).locks).toEqual([]);
  });
});
