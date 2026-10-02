import { useEffect, useMemo } from "react";

import type { SystemModel } from "../../engine/model/model";
import type { RigModel } from "../../engine/model/rig";
import { createDriver } from "../../engine/simulation/driver";
import type { DrawnEmitter } from "../utils/definitions";
import { useVfxMeshes } from "./useVfxMeshes";
import { useVfxTextures } from "./useVfxTextures";

/**
 * A system run on a driver of its own, with the textures and meshes its drawn emitters read.
 *
 * The driver is made once per seed. A new system swaps into it and a new rig steers it, so
 * an edit keeps the run where it stood.
 */
export function useParticleSystem(
  system: SystemModel,
  drawn: readonly DrawnEmitter[],
  seed: number,
  rig: RigModel,
) {
  const textures = useVfxTextures(drawn);
  const meshes = useVfxMeshes(drawn);
  const driver = useMemo(() => createDriver(seed), [seed]);

  useEffect(() => {
    driver.swap(system);
  }, [driver, system]);

  useEffect(() => {
    driver.steer(rig);
  }, [driver, rig]);

  return { textures, meshes, driver };
}
