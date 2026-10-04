import { describe, expect, it } from "vitest";

import type { Quat } from "../../assets/parsing/skeletonBuffer";
import { composeInto, rotateInto } from "../math";
import { eulerQuatInto, quatEulerInto, resolveSocketInto, type SocketModel } from "../sockets";
import { bindWorld } from "../world";
import { joint, parentsOf, rounded, skeletonOf } from "./fixtures";

/** A quarter turn about the up axis, which carries `+z` onto `+x`. */
const QUARTER_Y: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

/** A root, and a head a hundred up that the bind pose turns a quarter. */
const HEADED = skeletonOf(joint("Root", -1, [0, 0, 0]), joint("Head", 0, [0, 100, 0], QUARTER_Y));
const BIND = bindWorld(HEADED, parentsOf(HEADED));

function single(over: Partial<Extract<SocketModel, { kind: "singleJoint" }>> = {}): SocketModel {
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

/** The head's matrix: at `position`, turned by `rotation`. */
function head(position: number[], rotation: ArrayLike<number> = QUARTER_Y): Float32Array {
  return composeInto(new Float32Array(16), position, rotation, [1, 1, 1]) as Float32Array;
}

function resolved(socket: SocketModel, joint: Float32Array | null) {
  const out = new Float32Array(16);
  const found = resolveSocketInto(out, socket, joint, BIND);
  return { found, place: rounded(out.subarray(12, 15)), matrix: out };
}

/** Where `matrix` carries the direction `+z`. */
function facing(matrix: Float32Array): number[] {
  return rounded([matrix[8], matrix[9], matrix[10]]);
}

describe("eulerQuatInto", () => {
  const turned = (degrees: number[], vector: number[]) => {
    const q = new Float64Array(4);
    eulerQuatInto(q, 0, degrees);
    const out = new Float64Array(3);
    rotateInto(out, 0, q, 0, vector, 0);
    return rounded(out);
  };

  it("turns about one axis at a time as a right-handed turn", () => {
    expect(turned([90, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(turned([0, 90, 0], [0, 0, 1])).toEqual([1, 0, 0]);
    expect(turned([0, 0, 90], [1, 0, 0])).toEqual([0, 1, 0]);
  });

  it("turns about X first, then Z, then Y", () => {
    /* `+y` goes to `+z` about X, stays there about Z, and goes to `+x` about Y. */
    expect(turned([90, 90, 90], [0, 1, 0])).toEqual([1, 0, 0]);
    /* `+x` stays about X, goes to `+y` about Z, and stays there about Y. */
    expect(turned([90, 90, 90], [1, 0, 0])).toEqual([0, 1, 0]);
  });

  it("is undone by quatEulerInto, which leaves X at zero where Z stands a quarter up", () => {
    const q = new Float64Array(4);
    const back = new Float64Array(3);

    eulerQuatInto(q, 0, [20, -75, 40]);
    quatEulerInto(back, q);
    expect(rounded(back, 3)).toEqual([20, -75, 40]);

    eulerQuatInto(q, 0, [30, 10, 90]);
    quatEulerInto(back, q);
    expect(rounded(back, 3)).toEqual([0, 40, 90]);
  });
});

describe("resolveSocketInto", () => {
  it("stands a socket at the bind pose its offset away, in the bind pose's own axes", () => {
    const socket = single({ position: [0, 12, 5] });

    expect(resolved(socket, head([0, 100, 0])).place).toEqual([0, 112, 5]);
  });

  it("stands a socket its offset away on a bind pose that scales the joint's axes apart", () => {
    const stretched = skeletonOf(joint("Root", -1, [0, 0, 0]), {
      ...joint("Head", 0, [0, 100, 0], QUARTER_Y),
      scale: [2, 1, 1],
    });
    const bind = bindWorld(stretched, parentsOf(stretched));
    const posed = composeInto(new Float32Array(16), [0, 100, 0], QUARTER_Y, [2, 1, 1]);
    const out = new Float32Array(16);

    resolveSocketInto(out, single({ position: [4, 0, 6] }), posed, bind);

    expect(rounded(out.subarray(12, 15))).toEqual([4, 100, 6]);
  });

  it("carries the offset with the joint as the joint moves and turns", () => {
    const socket = single({ position: [0, 0, 5] });
    const turnedBack = [0, 0, 0, 1];

    /* The joint is turned a quarter back from its bind pose, so the offset turns with it. */
    expect(resolved(socket, head([10, 100, 0], turnedBack)).place).toEqual([5, 100, 0]);
  });

  it("turns the socket by its rotation offset in the joint's frame", () => {
    const plain = resolved(single(), head([0, 100, 0]));
    const tipped = resolved(single({ rotation: [0, 90, 0] }), head([0, 100, 0]));

    expect(facing(plain.matrix)).toEqual([1, 0, 0]);
    expect(facing(tipped.matrix)).toEqual([0, 0, -1]);
  });

  it("holds a frozen axis of the position where the bind pose puts it", () => {
    const socket = single({
      position: [0, 12, 0],
      freezePosition: [false, true, false],
    });

    expect(resolved(socket, head([30, 150, 7])).place).toEqual([30, 112, 7]);
  });

  it("holds a frozen angle of the rotation where the bind pose puts it", () => {
    const free = resolved(single(), head([0, 100, 0], [0, 0, 0, 1]));
    const frozen = resolved(
      single({ freezeRotation: [false, true, false] }),
      head([0, 100, 0], [0, 0, 0, 1]),
    );

    expect(facing(free.matrix)).toEqual([0, 0, 1]);
    expect(facing(frozen.matrix)).toEqual([1, 0, 0]);
  });

  it("resolves nowhere for a single joint socket with no joint", () => {
    expect(resolved(single({ parent: -1 }), null).found).toBe(false);
    expect(resolved(single(), null).found).toBe(false);
  });

  it("stands a world socket its offset from the character's origin, unturned", () => {
    const socket: SocketModel = {
      kind: "world",
      name: "Overhead",
      position: [0, 200, 0],
    };

    const { found, place, matrix } = resolved(socket, null);

    expect(found).toBe(true);
    expect(place).toEqual([0, 200, 0]);
    expect(facing(matrix)).toEqual([0, 0, 1]);
  });
});
