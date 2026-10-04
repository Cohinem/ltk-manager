import type { ChainRig } from "../../dynamics/build";
import type { DynamicsRig } from "../../dynamics/take";

/** The segments one ring of a radius is drawn with. */
const RING_SEGMENTS = 16;

/** The vertices the three rings of one sphere take. */
export const SPHERE_VERTICES = 3 * RING_SEGMENTS * 2;

/** The vertices one capsule takes: a sphere at each end and four lines between them. */
export const CAPSULE_VERTICES = SPHERE_VERTICES * 2 + 8;

/** The vertices one socket takes: three axes, and a line to its joint. */
export const SOCKET_VERTICES = 8;

/** The vertices the outline of the ground takes. */
export const GROUND_VERTICES = 8;

/** The cosine and the sine at each end of a ring's segments, the last being the first again. */
const RING = Float32Array.from({ length: (RING_SEGMENTS + 1) * 2 }, (_, at) => {
  const angle = (Math.floor(at / 2) / RING_SEGMENTS) * Math.PI * 2;
  return at % 2 === 0 ? Math.cos(angle) : Math.sin(angle);
});

/** One simulated joint as the overlay draws it. */
export interface DrawnJoint {
  readonly slot: number;
  readonly pinned: boolean;
  /** The collision radius in the skeleton's units, and zero for a joint with none. */
  readonly radius: number;
}

/** What `drawnJoints` reads of a rig. */
export interface DrawnRig {
  readonly chains: readonly Pick<ChainRig, "count" | "joint" | "simulated" | "pinned" | "radius">[];
  readonly slots: DynamicsRig["slots"];
}

/**
 * The joints of `rig` the overlay marks: every node of a chain that has a particle, then
 * every joint another kind of modifier writes. `scale` is what the character is drawn at,
 * which a chain's radius is divided by to stand in the skeleton's units.
 */
export function drawnJoints(rig: DrawnRig, scale: number): DrawnJoint[] {
  const unit = scale || 1;
  const held = new Map<number, DrawnJoint>();

  for (const chain of rig.chains) {
    for (let node = 0; node < chain.count; node += 1) {
      if (chain.simulated[node] === 0) continue;

      const pinned = chain.pinned[node] === 1;
      held.set(chain.joint[node], {
        slot: chain.joint[node],
        pinned,
        radius: pinned ? 0 : chain.radius[node] / unit,
      });
    }
  }

  for (const slot of rig.slots) {
    if (!held.has(slot)) held.set(slot, { slot, pinned: false, radius: 0 });
  }

  return [...held.values()];
}

/** One vertex written into `out` at float `at`, answering the float after it. */
export function vertexInto(out: Float32Array, at: number, x: number, y: number, z: number): number {
  out[at] = x;
  out[at + 1] = y;
  out[at + 2] = z;
  return at + 3;
}

/**
 * A sphere as a ring in each of the three planes through its centre, `SPHERE_VERTICES`
 * written into `out` at float `at`, answering the float after them.
 */
export function sphereInto(
  out: Float32Array,
  at: number,
  x: number,
  y: number,
  z: number,
  radius: number,
): number {
  let next = at;

  for (let plane = 0; plane < 3; plane += 1) {
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      for (let end = segment; end <= segment + 1; end += 1) {
        const a = RING[end * 2] * radius;
        const b = RING[end * 2 + 1] * radius;

        if (plane === 0) {
          next = vertexInto(out, next, x + a, y + b, z);
        } else if (plane === 1) {
          next = vertexInto(out, next, x, y + a, z + b);
        } else {
          next = vertexInto(out, next, x + a, y, z + b);
        }
      }
    }
  }

  return next;
}

/** `point` of the frame the column-major `m` holds, in the skeleton's space, into `out`. */
export function carryInto(out: Float32Array, m: ArrayLike<number>, point: ArrayLike<number>): void {
  const x = point[0];
  const y = point[1];
  const z = point[2];

  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

/**
 * Four unit directions across the axis from `a` to `b`, a quarter turn apart, into `out`
 * three floats each. Two points that coincide take the flat directions.
 */
export function sidesInto(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  let x = b[0] - a[0];
  let y = b[1] - a[1];
  let z = b[2] - a[2];
  const length = Math.hypot(x, y, z);

  if (length < 1e-9) {
    out.set(FLAT_SIDES);
    return;
  }

  x /= length;
  y /= length;
  z /= length;

  /* Crossed with whichever world axis the capsule's own leans least along. */
  const upright = Math.abs(y) >= 0.9;
  const ox = upright ? 1 : 0;
  const oy = upright ? 0 : 1;
  const ux = -z * oy;
  const uy = z * ox;
  const uz = x * oy - y * ox;
  const size = Math.hypot(ux, uy, uz);
  const fx = ux / size;
  const fy = uy / size;
  const fz = uz / size;
  const sx = y * fz - z * fy;
  const sy = z * fx - x * fz;
  const sz = x * fy - y * fx;

  out[0] = fx;
  out[1] = fy;
  out[2] = fz;
  out[3] = -fx;
  out[4] = -fy;
  out[5] = -fz;
  out[6] = sx;
  out[7] = sy;
  out[8] = sz;
  out[9] = -sx;
  out[10] = -sy;
  out[11] = -sz;
}

const FLAT_SIDES = [1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1];
