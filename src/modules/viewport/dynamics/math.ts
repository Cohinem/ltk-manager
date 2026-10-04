/**
 * Vector and quaternion arithmetic over flat arrays, for the simulation's typed state.
 *
 * A vector is three floats and a quaternion four, `x y z w`, each read and written at an
 * offset. Every `...Into` writes its result at `out[at]` and may alias its inputs.
 */

export type Floats = Float32Array | Float64Array | number[];

/** Below this a length is taken for zero, as the game takes one. */
export const EPSILON = 1e-9;

/** The up axis, which a unit turns about. */
export const UP: ArrayLike<number> = Float64Array.of(0, 1, 0);

/** `time` folded into one pass of `duration` seconds. */
export function folded(time: number, duration: number): number {
  return ((time % duration) + duration) % duration;
}

/** `radians` as the turn of at most a half turn that ends facing the same way. */
export function shortestTurn(radians: number): number {
  const whole = 2 * Math.PI;
  return radians - whole * Math.round(radians / whole);
}

/** The angle a rotation turns about the up axis. */
export function yawOf(rotation: ArrayLike<number>): number {
  const x = rotation[0];
  const y = rotation[1];
  const z = rotation[2];
  const w = rotation[3];
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x));
}

export function length(v: ArrayLike<number>, at = 0): number {
  return Math.hypot(v[at], v[at + 1], v[at + 2]);
}

export function dot(a: ArrayLike<number>, ai: number, b: ArrayLike<number>, bi: number): number {
  return a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
}

/** `a` turned by the quaternion `q`. */
export function rotateInto(
  out: Floats,
  at: number,
  q: ArrayLike<number>,
  qi: number,
  a: ArrayLike<number>,
  ai: number,
): void {
  const x = q[qi];
  const y = q[qi + 1];
  const z = q[qi + 2];
  const w = q[qi + 3];
  const vx = a[ai];
  const vy = a[ai + 1];
  const vz = a[ai + 2];

  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);

  out[at] = vx + w * tx + (y * tz - z * ty);
  out[at + 1] = vy + w * ty + (z * tx - x * tz);
  out[at + 2] = vz + w * tz + (x * ty - y * tx);
}

/** `a` turned by the inverse of the unit quaternion `q`. */
export function unrotateInto(
  out: Floats,
  at: number,
  q: ArrayLike<number>,
  qi: number,
  a: ArrayLike<number>,
  ai: number,
): void {
  CONJUGATE[0] = -q[qi];
  CONJUGATE[1] = -q[qi + 1];
  CONJUGATE[2] = -q[qi + 2];
  CONJUGATE[3] = q[qi + 3];
  rotateInto(out, at, CONJUGATE, 0, a, ai);
}

/** The Hamilton product `a * b`, which applies `b` first. */
export function multiplyInto(
  out: Floats,
  at: number,
  a: ArrayLike<number>,
  ai: number,
  b: ArrayLike<number>,
  bi: number,
): void {
  const ax = a[ai];
  const ay = a[ai + 1];
  const az = a[ai + 2];
  const aw = a[ai + 3];
  const bx = b[bi];
  const by = b[bi + 1];
  const bz = b[bi + 2];
  const bw = b[bi + 3];

  out[at] = aw * bx + ax * bw + ay * bz - az * by;
  out[at + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[at + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[at + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** `conjugate(a) * b`, the turn from `a` to `b` in `a`'s own frame. */
export function relativeInto(
  out: Floats,
  at: number,
  a: ArrayLike<number>,
  ai: number,
  b: ArrayLike<number>,
  bi: number,
): void {
  CONJUGATE[0] = -a[ai];
  CONJUGATE[1] = -a[ai + 1];
  CONJUGATE[2] = -a[ai + 2];
  CONJUGATE[3] = a[ai + 3];
  multiplyInto(out, at, CONJUGATE, 0, b, bi);
}

export function normalizeQuat(q: Floats, at: number): void {
  const norm = Math.hypot(q[at], q[at + 1], q[at + 2], q[at + 3]);
  if (norm < EPSILON) {
    q[at] = 0;
    q[at + 1] = 0;
    q[at + 2] = 0;
    q[at + 3] = 1;
    return;
  }

  q[at] /= norm;
  q[at + 1] /= norm;
  q[at + 2] /= norm;
  q[at + 3] /= norm;
}

/** The turn from `a` toward `b` by `mix`, the short way round. */
export function slerpInto(
  out: Floats,
  at: number,
  a: ArrayLike<number>,
  ai: number,
  b: ArrayLike<number>,
  bi: number,
  mix: number,
): void {
  let cosine =
    a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2] + a[ai + 3] * b[bi + 3];
  const sign = cosine < 0 ? -1 : 1;
  cosine *= sign;

  let fromWeight = 1 - mix;
  let toWeight = mix;
  if (cosine < 1 - 1e-6) {
    const angle = Math.acos(cosine);
    const sine = Math.sin(angle);
    fromWeight = Math.sin((1 - mix) * angle) / sine;
    toWeight = Math.sin(mix * angle) / sine;
  }
  toWeight *= sign;

  for (let axis = 0; axis < 4; axis += 1) {
    out[at + axis] = a[ai + axis] * fromWeight + b[bi + axis] * toWeight;
  }
  normalizeQuat(out, at);
}

/**
 * The shortest turn that carries the direction `from` onto the direction `to`.
 *
 * Neither needs unit length. Opposite directions turn half way round an axis across
 * `from`, and a direction of no length turns nothing.
 */
export function shortestArcInto(
  out: Floats,
  at: number,
  from: ArrayLike<number>,
  fi: number,
  to: ArrayLike<number>,
  ti: number,
): void {
  const fromLength = length(from, fi);
  const toLength = length(to, ti);
  if (fromLength < EPSILON || toLength < EPSILON) {
    out[at] = 0;
    out[at + 1] = 0;
    out[at + 2] = 0;
    out[at + 3] = 1;
    return;
  }

  const fx = from[fi] / fromLength;
  const fy = from[fi + 1] / fromLength;
  const fz = from[fi + 2] / fromLength;
  const tx = to[ti] / toLength;
  const ty = to[ti + 1] / toLength;
  const tz = to[ti + 2] / toLength;
  const cosine = fx * tx + fy * ty + fz * tz;

  if (cosine < -1 + 1e-6) {
    /* Any axis across `from` serves: the one made with whichever world axis is least along it. */
    let ax = 0;
    let ay = -fz;
    let az = fy;
    if (Math.abs(fx) > Math.abs(fz)) {
      ax = -fy;
      ay = fx;
      az = 0;
    }
    const norm = Math.hypot(ax, ay, az);
    out[at] = ax / norm;
    out[at + 1] = ay / norm;
    out[at + 2] = az / norm;
    out[at + 3] = 0;
    return;
  }

  out[at] = fy * tz - fz * ty;
  out[at + 1] = fz * tx - fx * tz;
  out[at + 2] = fx * ty - fy * tx;
  out[at + 3] = 1 + cosine;
  normalizeQuat(out, at);
}

/** The turn of `radians` about the unit `axis`. */
export function axisAngleInto(
  out: Floats,
  at: number,
  axis: ArrayLike<number>,
  ai: number,
  radians: number,
): void {
  const sine = Math.sin(radians / 2);
  out[at] = axis[ai] * sine;
  out[at + 1] = axis[ai + 1] * sine;
  out[at + 2] = axis[ai + 2] * sine;
  out[at + 3] = Math.cos(radians / 2);
}

/** A position, a rotation and a scale, which is the transform the game composes joints with. */
export interface Transform {
  readonly position: Float64Array;
  readonly rotation: Float64Array;
  readonly scale: Float64Array;
}

export function createTransform(): Transform {
  return {
    position: new Float64Array(3),
    rotation: Float64Array.of(0, 0, 0, 1),
    scale: Float64Array.of(1, 1, 1),
  };
}

/**
 * The position, rotation and scale of a column-major 4x4 with no shear.
 *
 * A mirrored matrix answers a negative scale on its first axis, as ThreeJS decomposes one.
 */
export function decomposeInto(out: Transform, m: ArrayLike<number>): Transform {
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const determinant =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (determinant < 0) sx = -sx;

  out.position[0] = m[12];
  out.position[1] = m[13];
  out.position[2] = m[14];
  out.scale[0] = sx;
  out.scale[1] = sy;
  out.scale[2] = sz;

  const ix = sx === 0 ? 0 : 1 / sx;
  const iy = sy === 0 ? 0 : 1 / sy;
  const iz = sz === 0 ? 0 : 1 / sz;
  basisQuatInto(
    out.rotation,
    0,
    m[0] * ix,
    m[1] * ix,
    m[2] * ix,
    m[4] * iy,
    m[5] * iy,
    m[6] * iy,
    m[8] * iz,
    m[9] * iz,
    m[10] * iz,
  );
  return out;
}

/** The quaternion of a rotation given as its three columns. */
function basisQuatInto(
  out: Floats,
  at: number,
  m00: number,
  m10: number,
  m20: number,
  m01: number,
  m11: number,
  m21: number,
  m02: number,
  m12: number,
  m22: number,
): void {
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out[at + 3] = 0.25 / s;
    out[at] = (m21 - m12) * s;
    out[at + 1] = (m02 - m20) * s;
    out[at + 2] = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    out[at + 3] = (m21 - m12) / s;
    out[at] = 0.25 * s;
    out[at + 1] = (m01 + m10) / s;
    out[at + 2] = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    out[at + 3] = (m02 - m20) / s;
    out[at] = (m01 + m10) / s;
    out[at + 1] = 0.25 * s;
    out[at + 2] = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    out[at + 3] = (m10 - m01) / s;
    out[at] = (m02 + m20) / s;
    out[at + 1] = (m12 + m21) / s;
    out[at + 2] = 0.25 * s;
  }
  normalizeQuat(out, at);
}

/** The column-major 4x4 of a position, a rotation and a scale. */
export function composeInto(
  out: Floats,
  position: ArrayLike<number>,
  rotation: ArrayLike<number>,
  scale: ArrayLike<number>,
): Floats {
  const [x, y, z, w] = [rotation[0], rotation[1], rotation[2], rotation[3]];
  const [sx, sy, sz] = [scale[0], scale[1], scale[2]];

  out[0] = (1 - 2 * (y * y + z * z)) * sx;
  out[1] = 2 * (x * y + z * w) * sx;
  out[2] = 2 * (x * z - y * w) * sx;
  out[3] = 0;
  out[4] = 2 * (x * y - z * w) * sy;
  out[5] = (1 - 2 * (x * x + z * z)) * sy;
  out[6] = 2 * (y * z + x * w) * sy;
  out[7] = 0;
  out[8] = 2 * (x * z + y * w) * sz;
  out[9] = 2 * (y * z - x * w) * sz;
  out[10] = (1 - 2 * (x * x + y * y)) * sz;
  out[11] = 0;
  out[12] = position[0];
  out[13] = position[1];
  out[14] = position[2];
  out[15] = 1;
  return out;
}

const CONJUGATE = new Float64Array(4);
