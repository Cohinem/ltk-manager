import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmissionSurfaceModel } from "../model/model";
import { field, flagOr, hashes, namedAsset, number } from "./readValue";

const SURFACE = nameHash("EmissionSurface");
const SKELETON = nameHash("VfxEmissionSkeletonData");
const MESH = nameHash("VfxEmissionMeshData");

/** Emission surfaces before and after the 15.22 class split. */
export function readEmissionSurface(node: VfxValue | null): EmissionSurfaceModel | null {
  if (node?.type !== "struct") return null;

  const nested = field(node, SURFACE);
  const held = nested?.type === "struct" ? nested : node;
  if (nested !== null && held.classHash !== SKELETON && held.classHash !== MESH) return null;

  const get = (name: string) => field(held, nameHash(name));

  return {
    kind: held.classHash === SKELETON ? "skeleton" : "mesh",
    mesh: namedAsset(get("meshName")),
    skeleton: namedAsset(get("skeletonName")),
    animation: namedAsset(get("AnimationName")),
    submeshes: hashes(get("Submeshes")),
    joints: hashes(get("JointMask")),
    scale: number(get("meshScale")) ?? 1,
    maxJointWeights: Math.max(0, Math.min(4, Math.trunc(number(get("maxJointWeights")) ?? 4))),
    useNormal: flagOr(get("useSurfaceNormalForBirthPhysics"), true),
  };
}
