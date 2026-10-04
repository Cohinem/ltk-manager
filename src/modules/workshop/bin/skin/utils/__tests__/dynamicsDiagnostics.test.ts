import { describe, expect, it } from "vitest";

import type { SkinModel } from "@/lib/tauri";

import { dynamicsDiagnostics } from "../dynamicsDiagnostics";
import { chain, constant, group, HAIR, POSE, ref, skin, socket, spring } from "./fixtures";

describe("dynamicsDiagnostics", () => {
  const codes = (model: SkinModel) => dynamicsDiagnostics(model, POSE).map((each) => each.code);

  it("finds nothing in a tree and a socket that stand as the game reads them", () => {
    expect(codes(HAIR)).toEqual([]);
  });

  it("names a root and a spring joint the skeleton lacks", () => {
    const model = skin({
      poseModifiers: [chain([group(0, [{ root: "Nowhere" }])]), spring(1, ref("Nowhere"))],
    });

    expect(codes(model)).toEqual(["treeRootMissing", "springJointMissing"]);
  });

  it("names a tree rooted under another tree's root", () => {
    const model = skin({
      poseModifiers: [chain([group(0, [{ root: "Hair_Root" }, { root: "Hair_1" }])])],
    });

    expect(codes(model)).toEqual(["treeOverlap"]);
  });

  it("names a tree with nothing under its root", () => {
    const model = skin({
      poseModifiers: [chain([group(0, [{ root: "Hair_2" }])])],
    });

    expect(codes(model)).toEqual(["treeNoLength"]);
  });

  it("names a curve key outside 0 to 1, a rod value with rods off, and links on one tree", () => {
    const held = group(0, [{ root: "Hair_Root" }]);
    const model = skin({
      poseModifiers: [
        chain([
          {
            ...held,
            lateralLinks: true,
            properties: {
              ...held.properties,
              damping: {
                value: 1,
                useCurve: true,
                curve: { times: [0, 1], values: [2, 0], modes: [] },
              },
              rodBend: constant(0.5),
            },
          },
        ]),
      ],
    });

    expect(dynamicsDiagnostics(model, POSE)).toEqual([
      { path: held.path, code: "curveClamped", parameter: "damping" },
      { path: held.path, code: "rodUnread", parameter: "rodBend" },
      { path: held.path, code: "linksAlone" },
    ]);
  });

  it("names a socket a joint shadows, a duplicate, and a parent the skeleton lacks", () => {
    const model = skin({
      sockets: [
        socket(0, "Hair_1", ref("Hair_2")),
        socket(1, "Tip", ref("Hair_2")),
        socket(2, "tip", ref("Nowhere")),
      ],
    });

    expect(codes(model)).toEqual(["socketNamedJoint", "socketDuplicate", "socketParentMissing"]);
  });
});
