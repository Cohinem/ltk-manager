/** The vector arithmetic a missile's flight is stepped with, in the engine's space. */

/** A point or a vector in the engine's space, mutable while a flight is stepped. */
export type Vec = [number, number, number];

/** Returns `vector` scaled so its horizontal length is `length`, keeping its slope. */
export function horizontalLength(vector: Vec, length: number): Vec {
  const across = flat(vector);
  return across === 0 ? [0, 0, 0] : scale(vector, length / across);
}

/** Returns the horizontal length of `vector`. */
export function flat(vector: Vec): number {
  return Math.hypot(vector[0], vector[2]);
}

/** Returns the dot product of `a` and `b` in the ground plane. */
export function flatDot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[2] * b[2];
}

/** Returns the dot product of `a` and `b`. */
export function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Returns `vector` at unit length, and `+Z` for a vector of no length. */
export function unit(vector: Vec): Vec {
  const length = Math.hypot(...vector);
  return length === 0 ? [0, 0, 1] : scale(vector, 1 / length);
}

/** Returns `a + b`. */
export function add(a: Vec, b: Vec): Vec {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Returns `a - b`. */
export function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Returns `vector` times `by`. */
export function scale(vector: Vec, by: number): Vec {
  return [vector[0] * by, vector[1] * by, vector[2] * by];
}

/** Returns `value` held between `least` and `most`. */
export function clamp(value: number, least: number, most: number): number {
  return Math.min(Math.max(value, least), most);
}
