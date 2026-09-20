import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Texture,
} from "three";

import type { MaterialPreview } from "@/lib/tauri";

import {
  DEFAULT_LAYER,
  drawnMeshes,
  type MapGeometry,
  MESH_FLAG,
} from "../../assets/parsing/mapBuffer";
import { applyBinding, lit } from "../../character/utils/submeshBinding";
import { recompileIfMoved, type SubmeshMaterial } from "../../shared/utils/renderState";
import { AXIS_SIGN } from "../../shared/utils/space";

/** A flat neutral the map's own shape reads against, where no material reaches it. */
const STONE = 0x9a958c;

/**
 * The game's own map, drawn behind whatever the scene draws.
 *
 * One `BufferGeometry` for the whole map and one group per submesh, per ADR-0044. A
 * group points at the material its submesh names, doubled where a mesh disables backface
 * culling, since a material is shared between flagged and unflagged meshes.
 */
export function Backdrop({
  map,
  materials: slots,
  textures,
  layer = DEFAULT_LAYER,
}: {
  readonly map: MapGeometry;
  readonly materials: readonly (MaterialPreview | null)[];
  readonly textures: ReadonlyMap<string, Texture>;
  readonly layer?: number;
}) {
  const geometry = useMemo(() => {
    const held = new BufferGeometry();
    held.setAttribute("position", new BufferAttribute(map.positions, 3));
    held.setAttribute("normal", new BufferAttribute(map.normals, 3));
    held.setAttribute("uv", new BufferAttribute(map.uv0, 2));
    if (map.uv1 !== null) held.setAttribute("uv1", new BufferAttribute(map.uv1, 2));
    held.setIndex(new BufferAttribute(map.indices, 1));
    return held;
  }, [map]);

  /* One pass builds both, because a group's material index is an index into the array
     this same walk fills, and a layer switch re-walks rather than refetching. */
  const materials = useMemo(() => {
    const built: SubmeshMaterial[] = [];
    const byKey = new Map<string, number>();
    const colors = { untextured: new Color(STONE), errored: new Color(STONE) };

    const indexOf = (material: number, doubleSided: boolean): number => {
      const key = `${material}:${doubleSided}`;
      const held = byKey.get(key);
      if (held !== undefined) return held;

      const path = map.materials[material] ?? "";
      const binding = {
        material: slots[material] ?? null,
        base: textures.get(path) ?? null,
        texture: null,
      };
      const drawn: SubmeshMaterial = lit(binding)
        ? new MeshLambertMaterial()
        : new MeshBasicMaterial();
      applyBinding(drawn, binding, colors);
      /* The mesh's own flag wins over the material's `cullEnable`, which the render-flag
         remap favours, and the program key was taken before it moved. */
      if (doubleSided) {
        drawn.side = DoubleSide;
        recompileIfMoved(drawn);
      }
      built.push(drawn);
      byKey.set(key, built.length - 1);
      return built.length - 1;
    };

    geometry.clearGroups();
    for (const mesh of drawnMeshes(map, layer)) {
      const doubleSided = (mesh.flags & MESH_FLAG.cullDisabled) !== 0;
      for (let at = 0; at < mesh.submeshCount; at += 1) {
        const submesh = map.submeshes[mesh.firstSubmesh + at];
        if (submesh === undefined) continue;
        geometry.addGroup(
          submesh.startIndex,
          submesh.indexCount,
          indexOf(submesh.material, doubleSided),
        );
      }
    }
    geometry.computeBoundingSphere();
    return built;
  }, [geometry, map, slots, textures, layer]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  return (
    <group scale={[AXIS_SIGN[0], AXIS_SIGN[1], AXIS_SIGN[2]]}>
      {/* Nothing rewinds triangles. The mirror above gives the world matrix a negative
          determinant, which ThreeJS already reads to flip its front face. */}
      <mesh geometry={geometry} material={materials} frustumCulled={false} />
    </group>
  );
}
