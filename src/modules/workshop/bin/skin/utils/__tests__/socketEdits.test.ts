import { describe, expect, it } from "vitest";

import type { Socket } from "@/lib/tauri";
import {
  createPose,
  type JointModel,
  type SkeletonModel,
  socketedPose,
  type SocketPlace,
} from "@/modules/viewport";

import { nameHash } from "../../../shared/utils/binHash";
import { FIELD, MESH_PROPERTIES } from "../dynamicsFields";
import { socketModelsOf } from "../dynamicsModel";
import { socketDragEdits, socketModelIndex, socketParentEdits, socketTurns } from "../socketEdits";

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
  joints: [joint("Root", -1, 100), joint("Head", 0, 50)],
  influences: Uint32Array.of(0, 1),
};
const BASE = createPose(SKELETON, null);

const SOCKETS = `${MESH_PROPERTIES.slice(2)}.${nameHash("SocketDefinitions").slice(2)}`;

function single(index: number, over: Partial<Extract<Socket, { kind: "singleJoint" }>> = {}) {
  return {
    kind: "singleJoint",
    path: `${SOCKETS}[${index}]`,
    name: `Socket${index}`,
    parent: { hash: nameHash("Head"), name: "Head" },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    freezePosition: [false, false, false],
    freezeRotation: [false, false, false],
    ...over,
  } satisfies Socket;
}

const ODD: Socket = { kind: "other", path: `${SOCKETS}[0]`, name: "Odd", class: "0x00000001" };
const WORLD: Socket = { kind: "world", path: `${SOCKETS}[2]`, name: "Over", position: [0, 0, 0] };

function posed(sockets: readonly Socket[]) {
  return socketedPose(BASE, socketModelsOf(sockets, BASE));
}

function place(position: [number, number, number]): SocketPlace {
  return { position, rotation: [0, 0, 0, 1], time: 0 };
}

/** The value the last edit sets, and the field it sets it on. */
function written(edits: ReturnType<typeof socketDragEdits>) {
  const last = edits[edits.length - 1];
  if (last?.type !== "setLeaf") return null;
  return { field: `0x${last.path.split(".").pop()}`, value: last.value };
}

describe("socketModelIndex", () => {
  it("counts past a socket the preview resolves nowhere", () => {
    const sockets = [ODD, single(1), WORLD];

    expect(socketModelIndex(sockets, sockets[1].path)).toBe(0);
    expect(socketModelIndex(sockets, WORLD.path)).toBe(1);
    expect(socketModelIndex(sockets, ODD.path)).toBe(-1);
  });
});

describe("socketTurns", () => {
  it("is false for a world socket and for a frozen angle", () => {
    expect(socketTurns(single(0))).toBe(true);
    expect(socketTurns(single(0, { freezeRotation: [false, true, false] }))).toBe(false);
    expect(socketTurns(WORLD)).toBe(false);
  });
});

describe("socketDragEdits", () => {
  it("writes the position offset a move left the socket at", () => {
    const sockets = [ODD, single(1)];

    /* The head stands at 150, so a place at 155 is five over it. */
    const edits = socketDragEdits(
      posed(sockets),
      sockets,
      sockets[1].path,
      place([2, 155, -3]),
      "translate",
    );

    expect(written(edits)).toEqual({
      field: FIELD.positionOffset,
      value: { type: "vector", values: [2, 5, -3] },
    });
  });

  it("writes the rotation offset a turn left the socket at", () => {
    const sockets = [single(0)];
    const quarterY: SocketPlace = {
      position: [0, 150, 0],
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      time: 0,
    };

    const edits = socketDragEdits(posed(sockets), sockets, sockets[0].path, quarterY, "rotate");

    expect(written(edits)).toEqual({
      field: FIELD.rotationOffset,
      value: { type: "vector", values: [0, 90, 0] },
    });
  });

  it("writes nothing for a turn of a socket with a frozen angle", () => {
    const sockets = [single(0, { freezeRotation: [true, false, false] })];

    const edits = socketDragEdits(
      posed(sockets),
      sockets,
      sockets[0].path,
      place([0, 150, 0]),
      "rotate",
    );

    expect(edits).toEqual([]);
  });

  it("writes a world socket's place as its offset", () => {
    const sockets = [WORLD];

    const edits = socketDragEdits(
      posed(sockets),
      sockets,
      WORLD.path,
      place([10, 200, 0]),
      "translate",
    );

    expect(written(edits)?.value).toEqual({ type: "vector", values: [10, 200, 0] });
  });
});

describe("socketParentEdits", () => {
  it("sets the parent joint by name", () => {
    const edits = socketParentEdits(`${SOCKETS}[0]`, "Head");

    expect(edits[edits.length - 1]).toMatchObject({
      type: "setLeaf",
      value: { type: "hash", text: "Head" },
    });
  });
});
