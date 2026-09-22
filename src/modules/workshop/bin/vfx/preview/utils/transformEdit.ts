import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import { AXIS_SIGN } from "@/modules/viewport";

import type { Point } from "../../engine/model/rig";

const MIRROR = new Matrix4().makeScale(...AXIS_SIGN);
const DEGREES = 180 / Math.PI;

/** Engine row-major basis in Three's matrix convention. */
export function basisMatrix(basis: Float32Array): Matrix4 {
  return new Matrix4().set(
    basis[0],
    basis[1],
    basis[2],
    0,
    basis[3],
    basis[4],
    basis[5],
    0,
    basis[6],
    basis[7],
    basis[8],
    0,
    0,
    0,
    0,
    1,
  );
}

/** Spawn-space offsets mapped to the mirrored viewport. */
export function translationFrame(basis: Float32Array, origin: Point): Matrix4 {
  return MIRROR.clone().multiply(basisMatrix(basis).setPosition(...origin));
}

/** Rotation editing requires an orthogonal, positive, uniformly scaled parent frame. */
export function rotationFrame(basis: Float32Array): Matrix4 | null {
  if (!basis.every(Number.isFinite)) {
    return null;
  }

  const matrix = basisMatrix(basis);
  const axes = [0, 1, 2].map((axis) => new Vector3().setFromMatrixColumn(matrix, axis));
  const length = axes[0].length();
  if (length < 1e-8 || matrix.determinant() <= 0) {
    return null;
  }

  for (const axis of axes) {
    if (Math.abs(axis.length() / length - 1) > 1e-5) {
      return null;
    }

    axis.divideScalar(length);
  }

  if (
    Math.abs(axes[0].dot(axes[1])) > 1e-5 ||
    Math.abs(axes[0].dot(axes[2])) > 1e-5 ||
    Math.abs(axes[1].dot(axes[2])) > 1e-5
  ) {
    return null;
  }

  return new Matrix4().makeBasis(axes[0], axes[1], axes[2]);
}

/** Engine YXZ degrees as a proper viewport rotation, including the X reflection. */
export function viewportRotation(parent: Matrix4, degrees: Point): Quaternion {
  const rotation = new Matrix4().makeRotationFromEuler(
    new Euler(degrees[0] / DEGREES, degrees[1] / DEGREES, degrees[2] / DEGREES, "YXZ"),
  );
  const matrix = MIRROR.clone().multiply(parent).multiply(rotation).multiply(MIRROR);

  return new Quaternion().setFromRotationMatrix(matrix);
}

/** A viewport rotation written back in the emitter's engine-local degrees. */
export function engineRotation(parent: Matrix4, rotation: Quaternion): Point {
  const matrix = parent
    .clone()
    .invert()
    .multiply(MIRROR)
    .multiply(new Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(MIRROR);
  const euler = new Euler().setFromRotationMatrix(matrix, "YXZ");

  return [euler.x * DEGREES, euler.y * DEGREES, euler.z * DEGREES];
}
