import {
  composeInto,
  createTransform,
  decomposeInto,
  type Floats,
  multiplyInto,
  normalizeQuat,
  relativeInto,
  rotateInto,
  unrotateInto,
} from "./math";
import type { Vec3 } from "./model";
import type { WorldPose } from "./world";

type Flags = readonly [boolean, boolean, boolean];

/** One socket of a skin: a named point that is not a joint of the skeleton. */
export type SocketModel =
  | {
      readonly kind: "singleJoint";
      readonly name: string;
      /** The joint the socket rides, by slot, and -1 for one the skeleton lacks. */
      readonly parent: number;
      /** The offset from the joint, in the axes of the bind pose. */
      readonly position: Vec3;
      /** The turn from the joint, Euler degrees. */
      readonly rotation: Vec3;
      /** The axes whose position stays where the bind pose puts it. */
      readonly freezePosition: Flags;
      /** The Euler angles that stay where the bind pose puts them. */
      readonly freezeRotation: Flags;
    }
  | {
      readonly kind: "world";
      readonly name: string;
      /** The offset from the character's own origin. */
      readonly position: Vec3;
    };

/**
 * The quaternion of Euler `degrees`, turned about X first, then Z, then Y, which is the
 * order the game reads a socket's rotation offset in.
 */
export function eulerQuatInto(out: Floats, at: number, degrees: ArrayLike<number>): void {
  const x = (degrees[0] * Math.PI) / 360;
  const y = (degrees[1] * Math.PI) / 360;
  const z = (degrees[2] * Math.PI) / 360;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);

  out[at] = sx * cy * cz + cx * sy * sz;
  out[at + 1] = cx * sy * cz + sx * cy * sz;
  out[at + 2] = cx * cy * sz - sx * sy * cz;
  out[at + 3] = cx * cy * cz - sx * sy * sz;
}

/**
 * The Euler degrees of the unit quaternion `q`, the inverse of `eulerQuatInto`.
 *
 * A turn of a quarter about Z leaves X and Y turning about one axis, and there X is zero.
 */
export function quatEulerInto(out: Floats, q: ArrayLike<number>, at = 0): void {
  const x = q[at];
  const y = q[at + 1];
  const z = q[at + 2];
  const w = q[at + 3];
  const m00 = 1 - 2 * (y * y + z * z);
  const m10 = 2 * (x * y + z * w);
  const m20 = 2 * (x * z - y * w);
  const m11 = 1 - 2 * (x * x + z * z);
  const m12 = 2 * (y * z - x * w);
  const m02 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const degrees = 180 / Math.PI;

  out[2] = Math.asin(Math.min(Math.max(m10, -1), 1)) * degrees;
  if (Math.abs(m10) < 1 - 1e-6) {
    out[0] = Math.atan2(-m12, m11) * degrees;
    out[1] = Math.atan2(-m20, m00) * degrees;
  } else {
    out[0] = 0;
    out[1] = Math.atan2(m02, m22) * degrees;
  }
}

/**
 * Where `socket` stands on a posed skeleton, as a column-major 4x4 into `out`, and false
 * for a socket that resolves nowhere.
 *
 * `joint` is the socket's parent joint in the skeleton's space at the moment asked, and
 * `bind` the skeleton's bind pose. A world socket rides the character's origin, so its
 * offset is its place. A single joint socket with no joint resolves nowhere, as the game
 * leaves a lookup of its name to fail.
 */
export function resolveSocketInto(
  out: Float32Array,
  socket: SocketModel,
  joint: ArrayLike<number> | null,
  bind: WorldPose,
): boolean {
  if (socket.kind === "world") {
    composeInto(out, socket.position, IDENTITY, ONES);
    return true;
  }
  if (socket.parent < 0 || joint === null) return false;

  const posed = decomposeInto(POSED, joint);
  const bindRotation = socket.parent * 4;
  const bindScale = socket.parent * 3;

  /* The offset is authored in the bind pose's axes, so it is carried into the joint's frame. */
  unrotateInto(OFFSET, 0, bind.rotations, bindRotation, socket.position, 0);
  for (let axis = 0; axis < 3; axis += 1) {
    const scale = bind.scales[bindScale + axis];
    OFFSET[axis] = scale === 0 ? 0 : OFFSET[axis] / scale;
  }

  for (let axis = 0; axis < 3; axis += 1) SCALED[axis] = OFFSET[axis] * posed.scale[axis];
  rotateInto(PLACE, 0, posed.rotation, 0, SCALED, 0);
  for (let axis = 0; axis < 3; axis += 1) PLACE[axis] += posed.position[axis];

  if (socket.freezePosition.some(Boolean)) {
    for (let axis = 0; axis < 3; axis += 1) {
      SCALED[axis] = OFFSET[axis] * bind.scales[bindScale + axis];
    }
    rotateInto(HELD, 0, bind.rotations, bindRotation, SCALED, 0);
    for (let axis = 0; axis < 3; axis += 1) {
      if (socket.freezePosition[axis]) PLACE[axis] = HELD[axis] + bind.positions[bindScale + axis];
    }
  }

  eulerQuatInto(TURN, 0, socket.rotation);
  multiplyInto(FACING, 0, posed.rotation, 0, TURN, 0);

  if (socket.freezeRotation.some(Boolean)) {
    multiplyInto(HELD_FACING, 0, bind.rotations, bindRotation, TURN, 0);
    quatEulerInto(ANGLES, FACING);
    quatEulerInto(HELD_ANGLES, HELD_FACING);
    for (let axis = 0; axis < 3; axis += 1) {
      if (socket.freezeRotation[axis]) ANGLES[axis] = HELD_ANGLES[axis];
    }
    eulerQuatInto(FACING, 0, ANGLES);
  }

  composeInto(out, PLACE, FACING, posed.scale);
  return true;
}

/** The offsets a socket is authored with. */
export interface SocketOffsets {
  /** `PositionOffset`. */
  readonly position: Vec3;
  /** `RotationOffset`, Euler degrees, and null where the offset alone does not set the facing. */
  readonly rotation: Vec3 | null;
}

/**
 * The offsets that stand `socket` at `place` facing `facing`, both in the skeleton's space,
 * and null for a socket that resolves nowhere. The inverse of `resolveSocketInto`.
 *
 * The place is affine in the position offset whichever axes are frozen, so the offset is
 * solved from the resolver's own answers at four offsets. A frozen angle comes from the
 * bind pose, which no rotation offset reaches by itself, so a socket with one answers no
 * rotation, and so does a world socket, which has none.
 */
export function socketOffsets(
  socket: SocketModel,
  joint: ArrayLike<number> | null,
  bind: WorldPose,
  place: ArrayLike<number>,
  facing: ArrayLike<number>,
): SocketOffsets | null {
  const at = (position: Vec3): Vec3 | null =>
    resolveSocketInto(PROBE, { ...socket, position }, joint, bind)
      ? [PROBE[12], PROBE[13], PROBE[14]]
      : null;
  const origin = at([0, 0, 0]);
  const x = at([1, 0, 0]);
  const y = at([0, 1, 0]);
  const z = at([0, 0, 1]);
  if (origin === null || x === null || y === null || z === null) return null;

  const columns = [x, y, z].map((each) => each.map((value, axis) => value - origin[axis]));
  const wanted = [place[0] - origin[0], place[1] - origin[1], place[2] - origin[2]];
  const whole = determinant(columns[0], columns[1], columns[2]);
  if (Math.abs(whole) < 1e-9) return null;

  const position: Vec3 = [
    determinant(wanted, columns[1], columns[2]) / whole,
    determinant(columns[0], wanted, columns[2]) / whole,
    determinant(columns[0], columns[1], wanted) / whole,
  ];
  if (socket.kind === "world" || socket.freezeRotation.some(Boolean) || joint === null) {
    return { position, rotation: null };
  }

  const posed = decomposeInto(POSED, joint);
  relativeInto(TURN, 0, posed.rotation, 0, facing, 0);
  normalizeQuat(TURN, 0);
  quatEulerInto(ANGLES, TURN);
  return { position, rotation: [ANGLES[0], ANGLES[1], ANGLES[2]] };
}

/** The determinant of the matrix whose columns are `a`, `b` and `c`. */
function determinant(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>): number {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    b[0] * (a[1] * c[2] - a[2] * c[1]) +
    c[0] * (a[1] * b[2] - a[2] * b[1])
  );
}

const IDENTITY = Float64Array.of(0, 0, 0, 1);
const PROBE = new Float32Array(16);
const ONES = Float64Array.of(1, 1, 1);
const POSED = createTransform();
const SCALED = new Float64Array(3);
const OFFSET = new Float64Array(3);
const PLACE = new Float64Array(3);
const HELD = new Float64Array(3);
const TURN = new Float64Array(4);
const FACING = new Float64Array(4);
const HELD_FACING = new Float64Array(4);
const ANGLES = new Float64Array(3);
const HELD_ANGLES = new Float64Array(3);
