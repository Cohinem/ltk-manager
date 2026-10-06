import { Matrix4, Vector3 } from "three";

import { createPose, type MeshGeometry, type Pose, type SkeletonModel } from "@/modules/viewport";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmissionSurfaceModel } from "../../engine/model/model";
import type { EmissionSampler } from "../../engine/simulation/emissionSurface";
import { drawnIndices } from "./submeshes";

/** The pose of the unit an effect is bound to. */
export interface BoundUnit {
  readonly pose: Pose;
  /** Seconds added to the run's time before the pose is sampled. */
  readonly offset: number;
}

/** The transforms of a surface skeleton's joints in the bound unit's pose. */
export interface BoundJoints {
  /** Writes the transform of joint `slot` at the run's `time` into `out`, column-major. */
  worldInto(slot: number, time: number, out: Float32Array): Float32Array;
}

/**
 * The joints of `skeleton` in the pose of `unit`, matched by joint name.
 *
 * A joint the unit does not have uses its rest pose. With no unit, every joint uses its rest
 * pose. "The emission source" in docs/ux/BIN_EDITOR.md.
 */
export function boundJoints(skeleton: SkeletonModel, unit: BoundUnit | null): BoundJoints {
  const rest = createPose(skeleton, null);
  if (unit === null) {
    return { worldInto: (slot, _time, out) => rest.worldInto(slot, 0, out) };
  }

  const slots = skeleton.joints.map((joint) => unit.pose.jointNamed(joint.name));
  return {
    worldInto(slot, time, out) {
      const held = slots[slot];
      if (held < 0) return rest.worldInto(slot, 0, out);

      return unit.pose.worldInto(held, time + unit.offset, out);
    },
  };
}

/**
 * A sampler of birth points on a skinned mesh.
 *
 * Every triangle is equally likely, whatever its area, as in the engine. The triangle is
 * skinned with `joints` at the sample time. The normal is the skinned vertex normals blended
 * with the point's weights, or the face normal for a mesh without vertex normals. The point is
 * not scaled.
 */
export function meshSurface(
  model: EmissionSurfaceModel,
  mesh: MeshGeometry,
  skeleton: SkeletonModel,
  joints: BoundJoints,
): EmissionSampler {
  const indices = drawnIndices(mesh, model.submeshes, []);
  const triangleCount = Math.floor(indices.length / 3);
  const { skinIndices, skinWeights } = mesh;

  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  const weights = [0, 0, 0];
  const blended = new Vector3();
  const normal = new Vector3();
  const edge = new Vector3();
  const part = new Vector3();
  const world = new Float32Array(16);
  const matrix = new Matrix4();
  const inverse = new Matrix4();
  const palette = skeleton.influences;
  const matrices = Array.from(palette, () => new Matrix4());
  let sampledAt = Number.NaN;

  /** Skins vertex `index` of `source` into `out`. `direction` skins it without translation. */
  function skinInto(source: Float32Array, index: number, direction: boolean, out: Vector3): void {
    out.fromArray(source, index * 3);
    if (skinIndices === null || skinWeights === null) return;

    let sum = 0;
    out.set(0, 0, 0);
    for (let slot = 0; slot < model.maxJointWeights; slot += 1) {
      const at = index * 4 + slot;
      const weight = skinWeights[at];
      const skin = matrices[skinIndices[at]];
      if (skin === undefined || !Number.isFinite(weight) || weight <= 0) continue;

      part.fromArray(source, index * 3);
      if (direction) part.transformDirection(skin);
      else part.applyMatrix4(skin);

      out.addScaledVector(part, weight);
      sum += weight;
    }

    if (sum > 0) {
      out.multiplyScalar(1 / sum);
    } else {
      out.fromArray(source, index * 3);
    }
  }

  return {
    sample(time, rng, out) {
      if (triangleCount === 0) return false;

      if (time !== sampledAt) {
        palette.forEach((slot, index) => {
          matrix.fromArray(joints.worldInto(slot, time, world));
          matrices[index]
            .copy(matrix)
            .multiply(inverse.fromArray(skeleton.joints[slot].inverseBind));
        });
        sampledAt = time;
      }

      const triangle = Math.min(triangleCount - 1, Math.floor(rng.unitFloat() * triangleCount)) * 3;
      for (let corner = 0; corner < 3; corner += 1) {
        skinInto(mesh.positions, indices[triangle + corner], false, vertices[corner]);
      }

      const root = Math.sqrt(rng.unitFloat());
      const along = rng.unitFloat();
      weights[0] = 1 - root;
      weights[1] = root * (1 - along);
      weights[2] = root * along;

      blended.set(0, 0, 0);
      for (let corner = 0; corner < 3; corner += 1) {
        blended.addScaledVector(vertices[corner], weights[corner]);
      }
      blended.toArray(out.position);

      normal.set(0, 0, 0);
      if (mesh.normals !== null) {
        for (let corner = 0; corner < 3; corner += 1) {
          skinInto(mesh.normals, indices[triangle + corner], true, blended);
          normal.addScaledVector(blended, weights[corner]);
        }
      }
      if (normal.lengthSq() === 0) {
        normal
          .subVectors(vertices[1], vertices[0])
          .cross(edge.subVectors(vertices[2], vertices[0]));
      }
      normal.normalize().toArray(out.normal);

      return true;
    },
  };
}

/** The total area under which the engine reads an emission mesh as having no surface. */
const LEAST_AREA = 1e-5;

/**
 * A sampler of birth points on a static mesh, `emissionMeshName`.
 *
 * A triangle is picked with a probability proportional to its area. The point blends the
 * three corners with two draws, as the engine does. That blend is not uniform over the
 * triangle: points are denser near the third corner. The normal is the face normal. The point
 * is not scaled. A mesh with no area gives no sample.
 */
export function staticMeshSurface(mesh: MeshGeometry): EmissionSampler {
  const indices = mesh.indices;
  const triangleCount = Math.floor(indices.length / 3);
  const reach = new Float64Array(triangleCount);
  const corners = [new Vector3(), new Vector3(), new Vector3()];
  const edge = new Vector3();
  const normal = new Vector3();
  const point = new Vector3();

  function cornersOf(triangle: number): void {
    for (let corner = 0; corner < 3; corner += 1) {
      corners[corner].fromArray(mesh.positions, indices[triangle * 3 + corner] * 3);
    }
    normal.subVectors(corners[1], corners[0]).cross(edge.subVectors(corners[2], corners[0]));
  }

  let total = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    cornersOf(triangle);
    total += normal.length() / 2;
    reach[triangle] = total;
  }

  return {
    sample(_time, rng, out) {
      if (total < LEAST_AREA) return false;

      const pick = rng.unitFloat() * total;
      let triangle = 0;
      while (triangle < triangleCount - 1 && pick >= reach[triangle]) triangle += 1;
      cornersOf(triangle);

      const u = rng.unitFloat();
      const v = rng.unitFloat();
      point
        .copy(corners[0])
        .multiplyScalar((1 - u) * (1 - v))
        .addScaledVector(corners[1], (1 - u) * v)
        .addScaledVector(corners[2], u);
      point.toArray(out.position);
      normal.normalize().toArray(out.normal);
      return true;
    },
  };
}

const FULL_TURN = Math.PI * 2;

/** The X component of a unit bone direction above which the perpendicular is built from Y. */
const NEARLY_ALONG = 0.9;

/**
 * A sampler of birth points on the bones of `skeleton`.
 *
 * A bone is the segment from a joint to its parent. `JointMask` selects bones by the joint at
 * the child end, and an empty mask selects every bone. A bone is picked with a probability
 * proportional to its length in the rest pose. The point is uniform along the bone, with both
 * ends taken from `joints` at the sample time. The normal is a unit vector perpendicular to the
 * bone at a random angle. When the selected bones have no length in total, there is no sample.
 */
export function skeletonSurface(
  model: EmissionSurfaceModel,
  skeleton: SkeletonModel,
  joints: BoundJoints,
): EmissionSampler {
  const rest = createPose(skeleton, null);
  const mask = new Set(model.joints);
  const slots = skeleton.joints.flatMap((joint, slot) =>
    rest.parents[slot] >= 0 && (mask.size === 0 || mask.has(nameHash(joint.name))) ? [slot] : [],
  );
  const world = new Float32Array(16);
  const positions = skeleton.joints.map((_, slot) => {
    rest.worldInto(slot, 0, world);
    return new Vector3(world[12], world[13], world[14]);
  });

  const reach = new Float64Array(slots.length);
  let total = 0;
  slots.forEach((slot, index) => {
    total += positions[slot].distanceTo(positions[rest.parents[slot]]);
    reach[index] = total;
  });

  const point = new Vector3();
  const bone = new Vector3();
  const across = new Vector3();
  const over = new Vector3();
  let sampledAt = Number.NaN;

  return {
    sample(time, rng, out) {
      if (total <= 0) return false;

      if (sampledAt !== time) {
        positions.forEach((position, slot) => {
          joints.worldInto(slot, time, world);
          position.set(world[12], world[13], world[14]);
        });
        sampledAt = time;
      }

      const pick = rng.unitFloat() * total;
      let index = 0;
      while (index < slots.length - 1 && pick >= reach[index]) {
        index += 1;
      }

      const slot = slots[index];
      const parent = positions[rest.parents[slot]];
      point.copy(parent).lerp(positions[slot], rng.unitFloat()).toArray(out.position);

      bone.subVectors(positions[slot], parent);
      if (bone.lengthSq() === 0) bone.set(0, 1, 0);
      bone.normalize();

      if (Math.abs(bone.x) < NEARLY_ALONG) across.set(1, 0, 0);
      else across.set(0, 1, 0);
      across.cross(bone).normalize();
      over.crossVectors(bone, across);

      const angle = rng.unitFloat() * FULL_TURN;
      point
        .copy(across)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(over, Math.sin(angle))
        .toArray(out.normal);

      return true;
    },
  };
}
