import { Matrix4, Vector3 } from "three";

import { type MeshGeometry, type Pose } from "@/modules/viewport";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmissionSurfaceModel } from "../../engine/model/model";
import type { EmissionSampler } from "../../engine/simulation/emissionSurface";
import { drawnIndices } from "./submeshes";

/** Animated triangle births, uniform by triangle count as the particle engine samples them. */
export function meshSurface(
  model: EmissionSurfaceModel,
  mesh: MeshGeometry,
  pose: Pose | null,
): EmissionSampler {
  const indices = drawnIndices(mesh, model.submeshes, []);
  const triangleCount = Math.floor(indices.length / 3);

  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  const normal = new Vector3();
  const edge = new Vector3();
  const vertex = new Vector3();
  const world = new Float32Array(16);
  const matrix = new Matrix4();
  const inverse = new Matrix4();
  const palette = pose?.skeleton.influences ?? new Uint32Array();
  const matrices = Array.from(palette, () => new Matrix4());
  let sampledAt = Number.NaN;

  function vertexInto(index: number, out: Vector3): void {
    out.fromArray(mesh.positions, index * 3);
    if (pose === null || mesh.skinIndices === null || mesh.skinWeights === null) return;

    let sum = 0;
    out.set(0, 0, 0);
    for (let part = 0; part < model.maxJointWeights; part += 1) {
      const at = index * 4 + part;
      const weight = mesh.skinWeights[at];
      const skin = matrices[mesh.skinIndices[at]];
      if (skin === undefined || !Number.isFinite(weight) || weight <= 0) continue;

      vertex.fromArray(mesh.positions, index * 3).applyMatrix4(skin);
      out.addScaledVector(vertex, weight);
      sum += weight;
    }

    if (sum > 0) {
      out.multiplyScalar(1 / sum);
    } else {
      out.fromArray(mesh.positions, index * 3);
    }
  }

  return {
    sample(time, rng, out) {
      if (triangleCount === 0) return false;

      if (pose !== null && time !== sampledAt) {
        palette.forEach((slot, index) => {
          matrix.fromArray(pose.worldInto(slot, time, world));
          matrices[index]
            .copy(matrix)
            .multiply(inverse.fromArray(pose.skeleton.joints[slot].inverseBind));
        });
        sampledAt = time;
      }

      const triangle = Math.min(triangleCount - 1, Math.floor(rng.unitFloat() * triangleCount)) * 3;
      for (let corner = 0; corner < 3; corner += 1) {
        vertexInto(indices[triangle + corner], vertices[corner]);
      }

      const root = Math.sqrt(rng.unitFloat());
      const along = rng.unitFloat();
      vertex
        .copy(vertices[0])
        .multiplyScalar(1 - root)
        .addScaledVector(vertices[1], root * (1 - along))
        .addScaledVector(vertices[2], root * along)
        .multiplyScalar(model.scale);
      vertex.toArray(out.position);

      normal
        .subVectors(vertices[1], vertices[0])
        .cross(edge.subVectors(vertices[2], vertices[0]))
        .normalize();
      normal.toArray(out.normal);

      return true;
    },
  };
}

/** Skeleton births weighted by the posed lengths of the selected bones. */
export function skeletonSurface(model: EmissionSurfaceModel, pose: Pose): EmissionSampler {
  const mask = new Set(model.joints);
  const slots = pose.skeleton.joints.flatMap((joint, slot) =>
    pose.parents[slot] >= 0 && (mask.size === 0 || mask.has(nameHash(joint.name))) ? [slot] : [],
  );
  const positions = pose.skeleton.joints.map(() => new Vector3());
  const lengths = new Float64Array(slots.length);
  const world = new Float32Array(16);
  const point = new Vector3();
  let sampledAt = Number.NaN;
  let total = 0;

  return {
    sample(time, rng, out) {
      if (sampledAt !== time) {
        positions.forEach((position, slot) => {
          pose.worldInto(slot, time, world);
          position.set(world[12], world[13], world[14]);
        });

        total = 0;
        slots.forEach((slot, index) => {
          total += positions[slot].distanceTo(positions[pose.parents[slot]]);
          lengths[index] = total;
        });
        sampledAt = time;
      }
      if (total <= 0) return false;

      const pick = rng.unitFloat() * total;
      let index = 0;
      while (index < slots.length - 1 && pick >= lengths[index]) {
        index += 1;
      }

      const slot = slots[index];
      const parent = positions[pose.parents[slot]];
      point
        .copy(parent)
        .lerp(positions[slot], rng.unitFloat())
        .multiplyScalar(model.scale)
        .toArray(out.position);
      point.subVectors(positions[slot], parent).normalize().toArray(out.normal);

      return true;
    },
  };
}
