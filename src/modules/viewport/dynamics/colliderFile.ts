import { unrotateInto } from "./math";
import type { Colliders, Vec3 } from "./model";
import type { WorldPose } from "./world";

/** A sphere as the collider file holds one: a joint by name, in the bind pose's space. */
export interface FileSphere {
  readonly joint: string;
  readonly centre: Vec3;
  readonly radius: number;
}

/** A capsule as the collider file holds one: two ends, each on a joint with its own radius. */
export interface FileCapsule {
  readonly jointA: string;
  readonly endA: Vec3;
  readonly radiusA: number;
  readonly jointB: string;
  readonly endB: Vec3;
  readonly radiusB: number;
}

/** The collision shapes of one collider file, before a skeleton places them. */
export interface ColliderFile {
  readonly spheres: readonly FileSphere[];
  readonly capsules: readonly FileCapsule[];
}

/**
 * The collision shapes a dynamics chain's collider file holds.
 *
 * The layout is the one the game's loader reads, since no file of the kind ships: two
 * words it does not use, a count of spheres, each a named joint with a centre and a
 * radius, then a count of capsules, each two of those. Little-endian throughout.
 *
 * @throws RangeError where a count or a name reaches past the bytes that arrived.
 */
export function readColliderFile(bytes: ArrayBuffer): ColliderFile {
  const view = new DataView(bytes);
  let at = 8;

  const word = () => {
    const value = view.getUint32(at, true);
    at += 4;
    return value;
  };
  const float = () => {
    const value = view.getFloat32(at, true);
    at += 4;
    return value;
  };
  const name = () => {
    const length = word();
    if (at + length > view.byteLength) throw new RangeError("A joint name reaches past the file");

    const text = DECODER.decode(new Uint8Array(bytes, at, length));
    at += length;
    return text;
  };
  const end = () => ({
    joint: name(),
    point: [float(), float(), float()] as const,
    radius: float(),
  });

  const spheres: FileSphere[] = [];
  for (let left = word(); left > 0; left -= 1) {
    const { joint, point, radius } = end();
    spheres.push({ joint, centre: point, radius });
  }

  const capsules: FileCapsule[] = [];
  for (let left = word(); left > 0; left -= 1) {
    const a = end();
    const b = end();
    capsules.push({
      jointA: a.joint,
      endA: a.point,
      radiusA: a.radius,
      jointB: b.joint,
      endB: b.point,
      radiusB: b.radius,
    });
  }

  return { spheres, capsules };
}

/**
 * `file` placed on a skeleton: each point carried from the bind pose's space into its
 * joint's own frame, where it rides the joint.
 *
 * `jointNamed` answers a joint's slot and -1 for a name the skeleton lacks. A sphere on
 * such a name is left out, and a capsule needs both of its joints.
 */
export function placeColliders(
  file: ColliderFile,
  jointNamed: (name: string) => number,
  bind: WorldPose,
): Colliders {
  const local = (slot: number, point: Vec3): Vec3 => {
    for (let axis = 0; axis < 3; axis += 1) {
      OFFSET[axis] = point[axis] - bind.positions[slot * 3 + axis];
    }
    unrotateInto(OFFSET, 0, bind.rotations, slot * 4, OFFSET, 0);

    const scale = (axis: number) => bind.scales[slot * 3 + axis] || 1;
    return [OFFSET[0] / scale(0), OFFSET[1] / scale(1), OFFSET[2] / scale(2)];
  };

  return {
    spheres: file.spheres.flatMap((sphere) => {
      const joint = jointNamed(sphere.joint);
      return joint < 0
        ? []
        : [
            {
              joint,
              centre: local(joint, sphere.centre),
              radius: sphere.radius,
            },
          ];
    }),
    capsules: file.capsules.flatMap((capsule) => {
      const jointA = jointNamed(capsule.jointA);
      const jointB = jointNamed(capsule.jointB);
      if (jointA < 0 || jointB < 0) return [];

      return [
        {
          jointA,
          endA: local(jointA, capsule.endA),
          radiusA: capsule.radiusA,
          jointB,
          endB: local(jointB, capsule.endB),
          radiusB: capsule.radiusB,
        },
      ];
    }),
  };
}

const DECODER = new TextDecoder();
const OFFSET = new Float64Array(3);
