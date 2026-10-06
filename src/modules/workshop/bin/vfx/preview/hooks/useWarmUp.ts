import { useCallback, useEffect, useRef } from "react";

import type { AssetLoad } from "../../rendering/utils/assetLoad";
import type { DrawnEmitter } from "../../rendering/utils/definitions";

/** The longest a first load pauses the run at its start, so an asset that never lands still plays. */
export const WARM_UP_LIMIT_MS = 4000;

/**
 * The run paused at its start while the first textures and meshes land.
 *
 * Answers the reports the two asset hooks take. A load an edit brings in comes after the
 * warm-up and pauses nothing, which decision 2.5 of docs/plans/vfx-particle-renderer.md keeps.
 *
 * Both reporters change when the system loads, so both asset hooks run their load again and
 * report for that system. The mesh hook reruns its load only when its requests change, and a
 * system with no mesh emitter has the same requests as no system.
 */
export function useWarmUp(drawn: readonly DrawnEmitter[], setWarming: (warming: boolean) => void) {
  const load = useRef({ textures: false, meshes: false, over: false });
  const loaded = drawn.length > 0;

  const settle = useCallback(() => {
    const current = load.current;
    if (current.over || !current.textures || !current.meshes) return;

    current.over = true;
    setWarming(false);
  }, [setWarming]);

  const reportTextures = useCallback(
    ({ pending }: AssetLoad) => {
      if (pending > 0 || !loaded) return;

      load.current.textures = true;
      settle();
    },
    [settle, loaded],
  );

  const reportMeshes = useCallback(
    ({ pending }: AssetLoad) => {
      if (pending > 0 || !loaded) return;

      load.current.meshes = true;
      settle();
    },
    [settle, loaded],
  );

  useEffect(() => {
    if (!loaded || load.current.over) return;

    setWarming(true);
    const limit = window.setTimeout(() => {
      load.current.over = true;
      setWarming(false);
    }, WARM_UP_LIMIT_MS);

    return () => {
      window.clearTimeout(limit);
      setWarming(false);
    };
  }, [loaded, setWarming]);

  return { reportTextures, reportMeshes };
}
