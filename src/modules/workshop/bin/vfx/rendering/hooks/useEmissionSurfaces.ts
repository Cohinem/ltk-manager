import { useEffect, useMemo, useRef } from "react";

import { previewBufferUrl, type PreviewForm } from "@/lib/previewUrl";
import type { NamedAsset } from "@/lib/tauri";
import { createPose, readClipBuffer, readMeshBuffer, readSkeletonBuffer } from "@/modules/viewport";

import type { EmissionMeshModel, EmissionSurfaceModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import type {
  EmissionSampler,
  EmissionSurfaces,
  EmitterSurfaces,
} from "../../engine/simulation/emissionSurface";
import type { DrawnEmitter } from "../utils/definitions";
import { meshSurface, skeletonSurface, staticMeshSurface } from "../utils/emissionSurface";

/** What one sampler is built from: an emitter's emission mesh, or its emission surface. */
type SurfaceSource =
  | { readonly kind: "mesh"; readonly model: EmissionMeshModel }
  | { readonly kind: "surface"; readonly model: EmissionSurfaceModel };

/** One sampler a drawn emitter needs, and the signature it is cached under. */
interface SurfaceRequest {
  readonly path: string;
  readonly index: number;
  readonly source: SurfaceSource;
  readonly signature: string;
}

function surfaceRequests(drawn: readonly DrawnEmitter[]): SurfaceRequest[] {
  return drawn.flatMap(({ path, emitter }) => {
    const sources: SurfaceSource[] = [];
    if (emitter.emissionMesh !== null) sources.push({ kind: "mesh", model: emitter.emissionMesh });
    if (emitter.emissionSurface !== null) {
      sources.push({ kind: "surface", model: emitter.emissionSurface });
    }
    return sources.map((source) => ({
      path,
      index: emitter.index,
      source,
      signature: JSON.stringify(source),
    }));
  });
}

const NO_SURFACES: EmissionSurfaces = new Map();

/**
 * Loaded emission meshes and surfaces installed before the driver replays its current time.
 *
 * The samplers are cached by what each is built from, so an edit that moves none hands the
 * driver the samplers it already has and costs no replay.
 */
export function useEmissionSurfaces(drawn: readonly DrawnEmitter[], driver: Driver | null): void {
  const wanted = useMemo(() => surfaceRequests(drawn), [drawn]);
  const signature = wanted
    .map((request) => `${request.path}:${request.index}|${request.signature}`)
    .join("\n");
  const latest = useRef(wanted);
  latest.current = wanted;
  const cache = useRef(new Map<string, EmissionSampler>());

  useEffect(() => {
    if (driver === null) return;

    const requests = latest.current;
    const abort = new AbortController();
    const samplers = cache.current;

    const install = () => {
      const wantedSignatures = new Set(requests.map((request) => request.signature));
      for (const key of samplers.keys()) {
        if (!wantedSignatures.has(key)) samplers.delete(key);
      }

      const surfaces = new Map<string, Map<number, EmitterSurfaces>>();
      for (const { path, index, source, signature: surfaceKey } of requests) {
        const sampler = samplers.get(surfaceKey);
        if (sampler === undefined) continue;

        let system = surfaces.get(path);
        if (system === undefined) {
          system = new Map();
          surfaces.set(path, system);
        }
        const held = system.get(index) ?? { mesh: null, surface: null };
        system.set(index, { ...held, [source.kind]: sampler });
      }
      driver.setSurfaces(surfaces.size === 0 ? NO_SURFACES : surfaces);
    };

    const owed = new Map<string, SurfaceSource>();
    for (const { source, signature: surfaceKey } of requests) {
      if (!samplers.has(surfaceKey)) owed.set(surfaceKey, source);
    }
    if (owed.size === 0) {
      install();
      return;
    }

    void Promise.allSettled(
      [...owed].map(
        async ([surfaceKey, source]) =>
          [surfaceKey, await loadSource(source, abort.signal)] as const,
      ),
    ).then((results) => {
      if (abort.signal.aborted) return;

      for (const result of results) {
        if (result.status !== "fulfilled") continue;

        const [surfaceKey, sampler] = result.value;
        if (sampler !== null) samplers.set(surfaceKey, sampler);
      }
      install();
    });

    return () => abort.abort();
  }, [signature, driver]);
}

async function bytesOf(asset: NamedAsset | null, form: PreviewForm, signal: AbortSignal) {
  if (asset?.asset == null) return null;

  const response = await fetch(previewBufferUrl(asset.asset, form), { signal });
  if (!response.ok) throw new Error(`Emission surface ${form} load failed: ${response.status}`);

  return response.arrayBuffer();
}

async function loadSource(
  source: SurfaceSource,
  signal: AbortSignal,
): Promise<EmissionSampler | null> {
  if (source.kind === "surface") return loadSurface(source.model, signal);

  const mesh = await bytesOf(source.model.mesh, "geometry", signal);
  return mesh === null ? null : staticMeshSurface(readMeshBuffer(mesh), source.model.scale);
}

async function loadSurface(
  model: EmissionSurfaceModel,
  signal: AbortSignal,
): Promise<EmissionSampler | null> {
  const [mesh, skeleton, clip] = await Promise.all([
    bytesOf(model.mesh, "geometry", signal),
    bytesOf(model.skeleton, "skeleton", signal),
    bytesOf(model.animation, "animation", signal),
  ]);

  const pose =
    skeleton === null
      ? null
      : createPose(readSkeletonBuffer(skeleton), clip === null ? null : readClipBuffer(clip));
  if (model.kind === "skeleton") return pose === null ? null : skeletonSurface(model, pose);

  return mesh === null ? null : meshSurface(model, readMeshBuffer(mesh), pose);
}
