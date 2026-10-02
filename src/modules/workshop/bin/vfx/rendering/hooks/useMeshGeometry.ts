import { useEffect, useState } from "react";
import type { BufferGeometry } from "three";

import type { AssetRef } from "@/lib/tauri";

import { loadMeshGeometry } from "./useVfxMeshes";

/**
 * A static mesh file's geometry at rest, and null until it loads or where it fails to.
 *
 * The geometry is the caller's while it is mounted and is disposed when `asset` changes or
 * the caller unmounts.
 */
export function useMeshGeometry(asset: AssetRef | null, path: string): BufferGeometry | null {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  useEffect(() => {
    if (asset === null) return;

    let live = true;
    let loaded: BufferGeometry | null = null;
    void loadMeshGeometry({
      asset,
      path,
      skeleton: null,
      animation: null,
      animationVariants: [],
      submeshes: [],
      submeshesAlways: [],
      alignPitch: false,
      alignYaw: false,
      skinned: false,
    })
      .then((next) => {
        if (!live) {
          next.dispose();
          return;
        }
        loaded = next;
        setGeometry(next);
      })
      .catch((error: unknown) => console.warn(`Mesh ${path} did not load`, error));

    return () => {
      live = false;
      loaded?.dispose();
      setGeometry(null);
    };
  }, [asset, path]);

  return geometry;
}
