import { useEffect } from "react";

import { previewBufferUrl, type PreviewForm } from "@/lib/previewUrl";
import type { NamedAsset } from "@/lib/tauri";
import { createPose, readClipBuffer, readMeshBuffer, readSkeletonBuffer } from "@/modules/viewport";

import type { EmitterModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import type { EmissionSampler } from "../../engine/simulation/emissionSurface";
import type { DrawnEmitter } from "../utils/definitions";
import { meshSurface, skeletonSurface } from "../utils/emissionSurface";

/** Loaded emission surfaces installed before the driver replays its current time. */
export function useEmissionSurfaces(drawn: readonly DrawnEmitter[], driver: Driver): void {
  useEffect(() => {
    const abort = new AbortController();
    const emitters = drawn
      .map(({ emitter }) => emitter)
      .filter((emitter) => emitter.emissionSurface !== null);
    if (emitters.length === 0) return;

    async function bytes(asset: NamedAsset | null, form: PreviewForm) {
      if (asset?.asset == null) return null;

      const response = await fetch(previewBufferUrl(asset.asset, form), { signal: abort.signal });
      if (!response.ok) throw new Error(`Emission surface ${form} load failed: ${response.status}`);

      return response.arrayBuffer();
    }

    async function load(emitter: EmitterModel): Promise<[EmitterModel, EmissionSampler] | null> {
      const model = emitter.emissionSurface;
      if (model === null) return null;

      const [mesh, skeleton, clip] = await Promise.all([
        bytes(model.mesh, "geometry"),
        bytes(model.skeleton, "skeleton"),
        bytes(model.animation, "animation"),
      ]);

      const pose =
        skeleton === null
          ? null
          : createPose(readSkeletonBuffer(skeleton), clip === null ? null : readClipBuffer(clip));
      if (model.kind === "skeleton")
        return pose === null ? null : [emitter, skeletonSurface(model, pose)];

      return mesh === null ? null : [emitter, meshSurface(model, readMeshBuffer(mesh), pose)];
    }

    void Promise.allSettled(emitters.map(load)).then((results) => {
      if (abort.signal.aborted) return;

      const surfaces = new Map<EmitterModel, EmissionSampler>();
      for (const result of results) {
        if (result.status === "fulfilled" && result.value !== null) surfaces.set(...result.value);
      }

      driver.setSurfaces(surfaces);
    });

    return () => abort.abort();
  }, [drawn, driver]);
}
