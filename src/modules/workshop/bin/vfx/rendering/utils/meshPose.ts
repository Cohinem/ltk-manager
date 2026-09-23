import { DataTexture, FloatType, Matrix4, RGBAFormat } from "three";

import { AXIS_SIGN, type MeshGeometry, type Pose } from "@/modules/viewport";

import { MESHES_PER_EMITTER } from "./buffers";

/** Bone matrices per particle, in the mirrored space of the mesh geometry. */
export interface MeshPose {
  readonly source: Pose;
  readonly texture: DataTexture;
  write(instance: number, time: number): void;
}

/** The pose palette shared by the solid, distortion and wireframe draws. */
export function meshPose(pose: Pose): MeshPose {
  const { skeleton } = pose;
  const count = Math.max(1, skeleton.influences.length);
  const data = new Float32Array(count * MESHES_PER_EMITTER * 16);
  const texture = new DataTexture(data, count * 4, MESHES_PER_EMITTER, RGBAFormat, FloatType);

  const world = new Float32Array(16);
  const matrix = new Matrix4();
  const inverse = new Matrix4();
  const mirror = new Matrix4().makeScale(...AXIS_SIGN);

  return {
    source: pose,
    texture,
    write(instance, time) {
      for (let influence = 0; influence < count; influence += 1) {
        const slot = skeleton.influences[influence];
        if (slot === undefined) {
          matrix.identity();
        } else {
          matrix.fromArray(pose.worldInto(slot, time, world));
          matrix.multiply(inverse.fromArray(skeleton.joints[slot].inverseBind));
          matrix.premultiply(mirror).multiply(mirror);
        }

        matrix.toArray(data, (instance * count + influence) * 16);
      }
    },
  };
}

/** Skin weights normalized over valid influences, with an identity fallback for empty rows. */
export function skinWeights(mesh: MeshGeometry, influences: number): Float32Array {
  const out = new Float32Array((mesh.positions.length / 3) * 4);

  for (let vertex = 0; vertex < out.length; vertex += 4) {
    let sum = 0;
    for (let part = 0; part < 4; part += 1) {
      const index = mesh.skinIndices?.[vertex + part] ?? influences;
      const weight = mesh.skinWeights?.[vertex + part] ?? 0;

      if (index < influences && Number.isFinite(weight) && weight > 0) {
        out[vertex + part] = weight;
        sum += weight;
      }
    }

    if (sum > 0) {
      for (let part = 0; part < 4; part += 1) {
        out[vertex + part] /= sum;
      }
    }
  }

  return out;
}
