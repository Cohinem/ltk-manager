import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Color, DoubleSide, MathUtils, MeshBasicMaterial, type Texture } from "three";

import { useAssetVersion, versionedUrl } from "@/lib/assetVersions";
import { previewUrl } from "@/lib/previewUrl";
import type { BinDocumentId } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

import { vfxQueries } from "../../hooks/useVfxSystem";
import { useMeshGeometry } from "../hooks/useMeshGeometry";
import { PARTICLE_LAYER } from "../utils/frame";
import { type ShimmerMesh, shimmerMeshesOf } from "../utils/shimmerMeshes";
import { acquireTexture } from "../utils/textureCache";

/**
 * Every shimmer emitter of the system as its mesh drawn once at rest.
 *
 * No component runtime spawns a shimmer particle yet, so this is what the preview shows of
 * one: the `.gmesh`, `.tmesh` or `.scb` its geometry component names, textured, tinted and
 * placed by its constant driver graphs. Disabled ones draw as well, since every shipped one
 * is disabled. Section 4.6 of docs/plans/shimmer-driver-graph.md.
 */
export function ShimmerMeshes({ document, entry }: { document: BinDocumentId; entry: string }) {
  const query = useQuery({ ...vfxQueries.system(document, entry), enabled: entry !== "" });
  const meshes = useMemo(
    () => (query.data === undefined ? [] : shimmerMeshesOf(query.data.root)),
    [query.data],
  );

  return (
    <>
      {meshes.map((mesh) => (
        <ShimmerMeshDraw key={`${mesh.index}:${mesh.mesh.path}`} mesh={mesh} />
      ))}
    </>
  );
}

function ShimmerMeshDraw({ mesh }: { mesh: ShimmerMesh }) {
  const geometry = useMeshGeometry(mesh.mesh.asset, mesh.mesh.path);
  const texture = useFlatTexture(mesh);
  const material = useMemo(() => {
    const [r, g, b, a] = mesh.color;
    return new MeshBasicMaterial({
      color: new Color(r, g, b),
      opacity: a,
      transparent: a < 1 || texture !== null,
      map: texture,
      side: DoubleSide,
      depthWrite: false,
    });
  }, [mesh.color, texture]);
  useEffect(() => () => material.dispose(), [material]);

  if (geometry === null) return null;

  const [x, y, z] = mesh.offset;
  const [rx, ry, rz] = mesh.rotation;
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[x * AXIS_SIGN[0], y * AXIS_SIGN[1], z * AXIS_SIGN[2]]}
      /* A turn about the mirrored axis keeps its sign, and a turn about either other flips. */
      rotation={[MathUtils.degToRad(rx), -MathUtils.degToRad(ry), -MathUtils.degToRad(rz)]}
      scale={[...mesh.scale]}
      layers={PARTICLE_LAYER}
    />
  );
}

function useFlatTexture(mesh: ShimmerMesh): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  const version = useAssetVersion(mesh.texture);
  const url = mesh.texture === null ? null : versionedUrl(previewUrl(mesh.texture), version);

  useEffect(() => {
    if (url === null) return;

    const held = acquireTexture(url, "flat");
    let live = true;
    void held.load().then((loaded) => {
      if (live) setTexture(loaded);
    });
    return () => {
      live = false;
      held.release();
      setTexture(null);
    };
  }, [url]);

  return texture;
}
