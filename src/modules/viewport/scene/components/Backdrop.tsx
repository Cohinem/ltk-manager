import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, FrontSide, MeshLambertMaterial } from "three";

import {
  DEFAULT_LAYER,
  type MapGeometry,
  MESH_FLAG,
  drawnMeshes,
} from "../../assets/parsing/mapBuffer";
import { AXIS_SIGN } from "../../shared/utils/space";

/**
 * Which materials a group can point at, in the order the array holds them.
 *
 * A material is shared between meshes that disable backface culling and meshes that do
 * not, so the flag cannot ride on a material alone. Two entries and a group picking one
 * is what expresses both without splitting the geometry.
 */
const SIDE = { culled: 0, doubleSided: 1 } as const;

/**
 * The game's own map, drawn behind whatever the scene draws.
 *
 * One `BufferGeometry` for the whole map and one group per submesh, per ADR-0044. Every
 * submesh draws with one flat material here: reading the map's own `StaticMaterialDef`s
 * is its own issue.
 */
export function Backdrop({
  map,
  layer = DEFAULT_LAYER,
}: {
  readonly map: MapGeometry;
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

  /* Rebuilt rather than refetched: a layer switch changes which submeshes are drawn and
     nothing about the buffer they are drawn from. */
  useEffect(() => {
    geometry.clearGroups();
    for (const mesh of drawnMeshes(map, layer)) {
      const side = (mesh.flags & MESH_FLAG.cullDisabled) !== 0 ? SIDE.doubleSided : SIDE.culled;
      for (let at = 0; at < mesh.submeshCount; at += 1) {
        const submesh = map.submeshes[mesh.firstSubmesh + at];
        if (submesh === undefined) continue;
        geometry.addGroup(submesh.startIndex, submesh.indexCount, side);
      }
    }
    geometry.computeBoundingSphere();
  }, [geometry, map, layer]);

  const materials = useMemo(
    () => [
      new MeshLambertMaterial({ color: STONE, side: FrontSide }),
      new MeshLambertMaterial({ color: STONE, side: DoubleSide }),
    ],
    [],
  );

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

/** A flat neutral the map's own shape reads against, until materials arrive. */
const STONE = 0x9a958c;
