import { useEffect, useState } from "react";
import { BufferAttribute, BufferGeometry } from "three";

import { previewBufferUrl, type PreviewForm } from "@/lib/previewUrl";
import type { AssetRef, NamedAsset } from "@/lib/tauri";
import {
  AXIS_SIGN,
  createPose,
  type MeshGeometry,
  readClipBuffer,
  readMeshBuffer,
  readSkeletonBuffer,
} from "@/modules/viewport";

import { fnv1a32 } from "../../../shared/utils/binHash";
import type { MeshModel } from "../../engine/model/model";
import { assetLoad, type AssetLoad } from "../utils/assetLoad";
import { type MeshBuffers, meshBuffers } from "../utils/buffers";
import type { DrawnEmitter } from "../utils/definitions";
import { meshPose, skinWeights } from "../utils/meshPose";
import { drawnIndices } from "../utils/submeshes";

/** One geometry per drawn emitter that resolved a mesh, by the drawn emitter's key. */
export type EmitterMeshes = ReadonlyMap<string, MeshBuffers>;

const NONE: EmitterMeshes = new Map();

/**
 * The mesh each mesh emitter draws, off the same scheme its textures come from.
 *
 * The bytes never cross the JavaScript heap as anything but the one buffer, and the
 * decode is the viewport's `meshBuffer.ts` rather than a parser of its own (decision 2.2
 * of docs/plans/vfx-particle-renderer.md).
 */
export function useVfxMeshes(
  drawn: readonly DrawnEmitter[],
  report?: (load: AssetLoad) => void,
): EmitterMeshes {
  const [meshes, setMeshes] = useState<EmitterMeshes>(NONE);

  useEffect(() => {
    const batch = assetLoad(drawn.filter(({ emitter }) => emitter.mesh !== null).length, report);
    if (drawn.length === 0) {
      setMeshes(NONE);
      return;
    }

    let live = true;
    const loaded = new Map<string, MeshBuffers>();

    for (const { key, emitter } of drawn) {
      if (emitter.mesh === null) continue;
      const mesh = emitter.mesh;

      void loadMesh(mesh, key)
        .then((buffers) => {
          if (!live) {
            buffers.geometry.dispose();
            buffers.pose?.texture.dispose();
            return;
          }
          loaded.set(key, buffers);
          setMeshes(new Map(loaded));
          batch.done();
        })
        .catch(() => batch.done(true));
    }

    return () => {
      live = false;
      batch.cancel();
      for (const held of loaded.values()) {
        held.geometry.dispose();
        held.pose?.texture.dispose();
      }
      setMeshes(NONE);
    };
  }, [drawn, report]);

  return meshes;
}

async function buffer(asset: AssetRef, form: PreviewForm): Promise<ArrayBuffer> {
  const answer = await fetch(previewBufferUrl(asset, form));
  if (!answer.ok) throw new Error(`Mesh ${form} load failed: ${answer.status}`);

  return answer.arrayBuffer();
}

/** A stable definition-level variant, unchanged by seeks or asset reloads. */
export function animationOf(model: MeshModel, key: string): NamedAsset | null {
  const variants = model.animationVariants;
  if (variants.length === 0) return model.animation;

  const hash = fnv1a32(`${model.path ?? ""}:${key}`);
  return variants[hash % variants.length];
}

async function loadMesh(model: MeshModel, key: string): Promise<MeshBuffers> {
  const animation = animationOf(model, key);
  const [bytes, skeletonBytes, clipBytes] = await Promise.all([
    buffer(model.asset, "geometry"),
    model.skinned && model.skeleton?.asset ? buffer(model.skeleton.asset, "skeleton") : null,
    model.skinned && animation?.asset ? buffer(animation.asset, "animation") : null,
  ]);

  const mesh = readMeshBuffer(bytes);
  const skeleton = skeletonBytes === null ? null : readSkeletonBuffer(skeletonBytes);
  const clip = clipBytes === null ? null : readClipBuffer(clipBytes);

  const geometry = geometryOf(mesh, model);
  const buffers = meshBuffers(geometry);
  if (skeleton === null || mesh.skinIndices === null || mesh.skinWeights === null) return buffers;

  geometry.setAttribute("skinIndex", new BufferAttribute(mesh.skinIndices, 4));
  geometry.setAttribute(
    "skinWeight",
    new BufferAttribute(skinWeights(mesh, skeleton.influences.length), 4),
  );

  return { ...buffers, pose: meshPose(createPose(skeleton, clip)) };
}

/**
 * One decoded mesh as the geometry an instanced draw takes.
 *
 * The file holds the engine's space, as the character's `.skn` does, and the instance's
 * turn is the engine's conjugated across the mirrored axis of world.ts. So the vertices
 * cross that axis here and each face's winding turns back with them, decision 2.40 of
 * docs/plans/vfx-particle-renderer.md. A `.scb` carries no normals, so the geometry
 * computes its own where the file holds none.
 */
export function geometryOf(mesh: MeshGeometry, model: MeshModel): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mirrored(mesh.positions), 3));
  if (mesh.uvs !== null) geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
  const indices = rewound(drawnIndices(mesh, model.submeshes, model.submeshesAlways));
  geometry.setIndex(new BufferAttribute(indices, 1));

  if (mesh.normals === null) geometry.computeVertexNormals();
  else geometry.setAttribute("normal", new BufferAttribute(mirrored(mesh.normals), 3));

  geometry.computeBoundingSphere();
  return geometry;
}

/** A block of three per vertex across the mirrored axis, as a copy. */
function mirrored(block: Float32Array): Float32Array {
  return block.map((value, at) => value * AXIS_SIGN[at % 3]);
}

/** Each triangle's last two corners swapped, as a copy, which the mirror turns inside out. */
function rewound(indices: Uint32Array): Uint32Array {
  const out = indices.slice();
  for (let at = 0; at + 2 < out.length; at += 3) {
    out[at + 1] = indices[at + 2];
    out[at + 2] = indices[at + 1];
  }
  return out;
}
