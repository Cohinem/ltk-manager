import { useEffect, useMemo, useRef } from "react";
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
 * A shader that marks a place rather than covering one.
 *
 * `Indicator_Faelights` names no albedo and tints itself cyan, and the game draws no
 * solid surface for it, so a backdrop that drew it would paint the river.
 */
const INDICATOR_SHADER = /indicator/i;

/** One material of the array, and what it has to be rebound to when its texture lands. */
interface Bound {
  readonly material: SubmeshMaterial;
  /** The material's own entry path, which its texture is held under. */
  readonly path: string;
  readonly slots: MaterialPreview | null;
  /** The mesh's own `disable_backface_culling`, which outranks the material's state. */
  readonly doubleSided: boolean;
}

/** Whether a submesh drawing `slots` covers anything at all. */
function covers(slots: MaterialPreview | null | undefined): boolean {
  if (slots == null) return true;
  return slots.base !== null || !INDICATOR_SHADER.test(slots.shader ?? "");
}

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
    /* Over 2.04 million vertices, so it is computed with the geometry and never again. */
    held.computeBoundingSphere();
    return held;
  }, [map]);

  const colors = useMemo(() => ({ untextured: new Color(STONE), errored: new Color(STONE) }), []);

  /* Built without the textures, which arrive over seconds. A material's class and a
     group's material index are fixed by the map, so a texture landing rebinds one
     material rather than rebuilding the array and re-walking 600 groups. */
  const bound = useMemo(() => {
    const built: Bound[] = [];
    const byKey = new Map<string, number>();

    const indexOf = (material: number, doubleSided: boolean): number => {
      const key = `${material}:${doubleSided}`;
      const held = byKey.get(key);
      if (held !== undefined) return held;

      const named = slots[material] ?? null;
      const drawn: SubmeshMaterial = lit({ material: named, base: null, texture: null })
        ? new MeshLambertMaterial()
        : new MeshBasicMaterial();
      built.push({
        material: drawn,
        path: map.materials[material] ?? "",
        slots: named,
        doubleSided,
      });
      byKey.set(key, built.length - 1);
      return built.length - 1;
    };

    geometry.clearGroups();
    for (const mesh of drawnMeshes(map, layer)) {
      if (mesh.submeshCount === 0) continue;
      const doubleSided = (mesh.flags & MESH_FLAG.cullDisabled) !== 0;
      for (let at = 0; at < mesh.submeshCount; at += 1) {
        const submesh = map.submeshes[mesh.firstSubmesh + at];
        if (submesh === undefined || !covers(slots[submesh.material])) continue;
        geometry.addGroup(
          submesh.startIndex,
          submesh.indexCount,
          indexOf(submesh.material, doubleSided),
        );
      }
    }
    return built;
  }, [geometry, map, slots, layer]);

  /* What each material was last bound to, so a wave of arrivals rebinds the few that
     moved rather than all 183 once a frame. Indexed by `bound`, because two entries of
     it share one entry path where a mesh disables culling. */
  const applied = useRef<(Texture | null)[]>([]);
  useEffect(() => {
    applied.current = [];
  }, [bound, colors]);

  /* The mesh's own cull flag wins over the material's `cullEnable`, which the render-flag
     remap favours, so it is written back over what the binding put there. */
  useEffect(() => {
    for (const [at, entry] of bound.entries()) {
      const base = textures.get(entry.path) ?? null;
      if (applied.current[at] === base) continue;
      applied.current[at] = base;
      applyBinding(entry.material, { material: entry.slots, base, texture: null }, colors);
      if (entry.doubleSided && entry.material.side !== DoubleSide) {
        entry.material.side = DoubleSide;
        recompileIfMoved(entry.material);
      }
    }
  }, [bound, textures, colors]);

  const materials = useMemo(() => bound.map((entry) => entry.material), [bound]);

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
