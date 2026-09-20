import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type CubeTexture, SRGBColorSpace } from "three";

import { previewCubeUrl } from "@/lib/previewUrl";

import { loadCubeTexture } from "../../shared/utils/cubeTexture";
import { backdropQueries } from "../hooks/useMapBackdrop";

/**
 * The sky behind a map backdrop, in place of the stage's flat colour.
 *
 * No map declares a sky of its own. The install ships one cube map under
 * `assets/maps/skyboxes`, in every map's archive, and this draws it for whichever map is
 * on. It is drawn across the scene's one mirrored axis like everything else, which a sky
 * does not show. An install without the file keeps the flat colour.
 */
export function Sky() {
  const asset = useQuery(backdropQueries.sky()).data ?? null;
  const [sky, setSky] = useState<CubeTexture | null>(null);

  useEffect(() => {
    if (asset === null) return;
    let live = true;
    let held: CubeTexture | null = null;
    void loadCubeTexture(previewCubeUrl(asset)).then((cube) => {
      if (cube === null) return;
      if (!live) {
        cube.dispose();
        return;
      }
      cube.colorSpace = SRGBColorSpace;
      held = cube;
      setSky(cube);
    });
    return () => {
      live = false;
      held?.dispose();
      setSky(null);
    };
  }, [asset]);

  return sky === null ? null : <primitive attach="background" object={sky} />;
}
