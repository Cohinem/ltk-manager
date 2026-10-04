import { describe, expect, it } from "vitest";

import { placeColliders, readColliderFile } from "../colliderFile";
import { bindWorld } from "../world";
import { joint, parentsOf, skeletonOf } from "./fixtures";

/** A collider file as the save command writes one. */
function fileBytes(write: (out: Writer) => void): ArrayBuffer {
  const bytes: number[] = [];
  const view = new DataView(new ArrayBuffer(4));
  const out: Writer = {
    word: (value) => {
      view.setUint32(0, value, true);
      bytes.push(...new Uint8Array(view.buffer));
    },
    float: (value) => {
      view.setFloat32(0, value, true);
      bytes.push(...new Uint8Array(view.buffer));
    },
    name: (text) => {
      out.word(text.length);
      bytes.push(...new TextEncoder().encode(text));
    },
  };
  out.word(0);
  out.word(0);
  write(out);
  return Uint8Array.from(bytes).buffer;
}

interface Writer {
  readonly word: (value: number) => void;
  readonly float: (value: number) => void;
  readonly name: (text: string) => void;
}

function end(out: Writer, name: string, point: readonly number[], radius: number): void {
  out.name(name);
  point.forEach(out.float);
  out.float(radius);
}

describe("readColliderFile", () => {
  it("reads a sphere after two unused words and a count", () => {
    const bytes = fileBytes((out) => {
      out.word(1);
      end(out, "Head", [1, 2, 3], 0.5);
      out.word(0);
    });

    expect(readColliderFile(bytes)).toEqual({
      spheres: [{ joint: "Head", centre: [1, 2, 3], radius: 0.5 }],
      capsules: [],
    });
  });

  it("reads a capsule as two named ends after the spheres", () => {
    const bytes = fileBytes((out) => {
      out.word(0);
      out.word(1);
      end(out, "Neck", [0, 140, 0], 6);
      end(out, "Chest", [0, 120, 0], 14);
    });

    expect(readColliderFile(bytes).capsules).toEqual([
      {
        jointA: "Neck",
        endA: [0, 140, 0],
        radiusA: 6,
        jointB: "Chest",
        endB: [0, 120, 0],
        radiusB: 14,
      },
    ]);
  });

  it("throws for a name that reaches past the file", () => {
    const bytes = fileBytes((out) => {
      out.word(1);
      out.word(64);
    });

    expect(() => readColliderFile(bytes)).toThrow(RangeError);
  });
});

describe("placeColliders", () => {
  const skeleton = skeletonOf(joint("Root", -1, [0, 100, 0]), joint("Head", 0, [0, 40, 0]));
  const bind = bindWorld(skeleton, parentsOf(skeleton));
  const slotOf = (name: string) => skeleton.joints.findIndex((each) => each.name === name);

  it("carries a sphere's centre into the frame of the joint it rides", () => {
    const placed = placeColliders(
      {
        spheres: [{ joint: "Head", centre: [0, 150, 5], radius: 12 }],
        capsules: [],
      },
      slotOf,
      bind,
    );

    expect(placed.spheres).toEqual([{ joint: 1, centre: [0, 10, 5], radius: 12 }]);
  });

  it("leaves out a sphere on a joint the skeleton lacks, and a capsule missing either joint", () => {
    const placed = placeColliders(
      {
        spheres: [{ joint: "Tail", centre: [0, 0, 0], radius: 1 }],
        capsules: [
          {
            jointA: "Head",
            endA: [0, 140, 0],
            radiusA: 1,
            jointB: "Tail",
            endB: [0, 0, 0],
            radiusB: 1,
          },
        ],
      },
      slotOf,
      bind,
    );

    expect(placed).toEqual({ spheres: [], capsules: [] });
  });
});
