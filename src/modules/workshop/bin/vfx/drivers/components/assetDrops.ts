import { use, useMemo, useRef } from "react";

import type { BinRow, ValueEdit } from "@/lib/tauri";

import { type AssetDropDetail, useAssetDrop } from "../../../../state";
import { assetKindOf, pathFieldOf, takesPath } from "../../../paths/utils/pathField";
import { nameHash } from "../../../shared/utils/binHash";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { hashedLeaf, stringLeaf } from "../../../tree/utils/leafText";

const FIELD = {
  texture: nameHash("texture"),
  primitive: nameHash("primitive"),
  mesh: nameHash("mMesh"),
  meshName: nameHash("mSimpleMeshName"),
  meshClass: nameHash("VfxPrimitiveMesh"),
} as const;

/**
 * A field line's drop of a content path onto its row, where the row is a path field that
 * takes the path's extension. The drop is the row's own commit, so it is one undo step.
 */
export function useRowPathDrop(row: BinRow | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const commit = use(LeafEditContext)?.commit;
  const onDrop = useMemo(() => {
    const field = row === undefined ? null : pathFieldOf(row);
    if (row === undefined || field === null || commit === undefined) return null;

    return (drop: AssetDropDetail) => {
      if (!takesPath(field.extensions, drop.path)) return false;

      const leaf =
        row.value.type === "wadChunkLink"
          ? hashedLeaf("wadChunkLink", drop.path)
          : stringLeaf(drop.path);
      void commit(row, leaf);
      return true;
    };
  }, [row, commit]);
  useAssetDrop(ref, onDrop);

  return { ref, target: onDrop !== null };
}

/**
 * The edit a texture or a mesh dropped on an emitter writes: its `texture`, or a mesh
 * primitive holding the mesh. Null for a path of another kind.
 */
export function emitterDropEdit(path: string): { field: string; edits: ValueEdit[] } | null {
  const kind = assetKindOf(path);
  const text = { type: "string", value: path } as const;
  if (kind === "texture") {
    return { field: FIELD.texture, edits: [{ type: "setLeaf", path: "", value: text }] };
  }
  if (kind !== "mesh") return null;

  const mesh = FIELD.mesh.slice(2);
  return {
    field: FIELD.primitive,
    edits: [
      { type: "replacePointer", path: "", class: FIELD.meshClass },
      { type: "ensureProperty", path: "", field: FIELD.mesh },
      { type: "ensureProperty", path: mesh, field: FIELD.meshName },
      { type: "setLeaf", path: `${mesh}.${FIELD.meshName.slice(2)}`, value: text },
    ],
  };
}
