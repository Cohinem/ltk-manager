import { describe, expect, it } from "vitest";

import type { Quat } from "../../assets/parsing/skeletonBuffer";
import { composeInto, createTransform, decomposeInto } from "../math";
import { eulerQuatInto, resolveSocketInto, type SocketModel, socketOffsets } from "../sockets";
import { bindWorld } from "../world";
import { joint, parentsOf, rounded, skeletonOf } from "./fixtures";

/** A quarter turn about the up axis. */
const QUARTER_Y: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

/** A root, and a head a hundred up that the bind pose turns a quarter. */
const HEADED = skeletonOf(joint("Root", -1, [0, 0, 0]), joint("Head", 0, [0, 100, 0], QUARTER_Y));
const BIND = bindWorld(HEADED, parentsOf(HEADED));

type Single = Extract<SocketModel, { kind: "singleJoint" }>;

function single(over: Partial<Single> = {}): Single {
  return {
    kind: "singleJoint",
    name: "HeadTop",
    parent: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    freezePosition: [false, false, false],
    freezeRotation: [false, false, false],
    ...over,
  };
}

/** The head in a clip: moved off its bind place and turned off its bind facing. */
function posedHead(): Float32Array {
  const turn = new Float64Array(4);
  eulerQuatInto(turn, 0, [25, -40, 10]);
  return composeInto(new Float32Array(16), [12, 90, -7], turn, [1, 1, 1]) as Float32Array;
}

/** The offsets that put `socket` back where the resolver stands it. */
function roundTrip(socket: SocketModel, head: Float32Array | null) {
  const matrix = new Float32Array(16);
  if (!resolveSocketInto(matrix, socket, head, BIND)) return null;

  const stood = decomposeInto(createTransform(), matrix);
  return socketOffsets(socket, head, BIND, stood.position, stood.rotation);
}

describe("socketOffsets", () => {
  it("answers the offsets a socket on a posed joint was resolved from", () => {
    const socket = single({ position: [3, -4, 5], rotation: [20, 30, -10] });

    const found = roundTrip(socket, posedHead());

    expect(rounded(found?.position ?? [], 2)).toEqual([3, -4, 5]);
    expect(rounded(found?.rotation ?? [], 2)).toEqual([20, 30, -10]);
  });

  it("solves the position with an axis frozen to the bind pose", () => {
    const socket = single({ position: [3, -4, 5], freezePosition: [false, true, false] });

    const found = roundTrip(socket, posedHead());

    expect(rounded(found?.position ?? [], 2)).toEqual([3, -4, 5]);
  });

  it("answers no rotation for a socket with a frozen angle", () => {
    const socket = single({ position: [1, 2, 3], freezeRotation: [true, false, false] });

    const found = roundTrip(socket, posedHead());

    expect(rounded(found?.position ?? [], 2)).toEqual([1, 2, 3]);
    expect(found?.rotation).toBeNull();
  });

  it("takes a world socket's place as its offset", () => {
    const socket: SocketModel = { kind: "world", name: "Overhead", position: [0, 0, 0] };

    const found = socketOffsets(socket, null, BIND, [10, 200, -30], [0, 0, 0, 1]);

    expect(rounded(found?.position ?? [])).toEqual([10, 200, -30]);
    expect(found?.rotation).toBeNull();
  });

  it("answers nothing for a socket that resolves nowhere", () => {
    expect(socketOffsets(single({ parent: -1 }), null, BIND, [0, 0, 0], [0, 0, 0, 1])).toBeNull();
  });
});
