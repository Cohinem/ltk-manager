import { useEffect, useMemo, useRef } from "react";

import { previewBufferUrl, type PreviewForm } from "@/lib/previewUrl";
import type { NamedAsset } from "@/lib/tauri";
import { readMeshBuffer, readSkeletonBuffer } from "@/modules/viewport";

import type { EmissionMeshModel, EmissionSurfaceModel } from "../../engine/model/model";
import type { Driver } from "../../engine/simulation/driver";
import type {
  EmissionSampler,
  EmissionSurfaces,
  EmitterSurfaces,
} from "../../engine/simulation/emissionSurface";
import type { DrawnEmitter } from "../utils/definitions";
import {
  boundJoints,
  type BoundUnit,
  meshSurface,
  skeletonSurface,
  staticMeshSurface,
} from "../utils/emissionSurface";

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

/** The loaded files of one source, as a factory of its sampler. */
interface LoadedSource {
  /** The sampler depends on the bound unit's pose, so it is rebuilt when the unit changes. */
  readonly posed: boolean;
  readonly sampler: (unit: BoundUnit | null) => EmissionSampler;
}

/** A loaded source, the sampler last built from it, and the unit that sampler was built for. */
interface HeldSource {
  readonly loaded: LoadedSource;
  unit: BoundUnit | null;
  sampler: EmissionSampler;
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
      signature: signatureOf(source),
    }));
  });
}

/**
 * The cache key of a source: the fields its sampler is built from.
 *
 * The scale and the normal switch are not part of the key. `emit` applies both from the
 * emitter, so an edit of either reuses the loaded sampler.
 */
function signatureOf(source: SurfaceSource): string {
  if (source.kind === "mesh") return JSON.stringify(["mesh", source.model.mesh]);

  const { kind, mesh, skeleton, submeshes, joints, maxJointWeights } = source.model;
  return JSON.stringify(["surface", kind, mesh, skeleton, submeshes, joints, maxJointWeights]);
}

const NO_SURFACES: EmissionSurfaces = new Map();

/**
 * Loads the emission meshes and surfaces of `drawn` and installs their samplers on `driver`.
 *
 * `unit` is the unit the effect is bound to. Skinned mesh and skeleton surfaces are sampled in
 * its pose. Samplers are cached by the fields they are built from and by the unit, so an edit
 * that changes neither installs the same samplers and the driver does not replay.
 */
export function useEmissionSurfaces(
  drawn: readonly DrawnEmitter[],
  driver: Driver | null,
  unit: BoundUnit | null = null,
): void {
  const wanted = useMemo(() => surfaceRequests(drawn), [drawn]);
  const signature = wanted
    .map((request) => `${request.path}:${request.index}|${request.signature}`)
    .join("\n");
  const latest = useRef({ wanted, unit });
  latest.current = { wanted, unit };
  const cache = useRef(new Map<string, HeldSource>());
  const pose = unit?.pose ?? null;
  const offset = unit?.offset ?? 0;

  useEffect(() => {
    if (driver === null) return;

    const { wanted: requests, unit: bound } = latest.current;
    const abort = new AbortController();
    const held = cache.current;

    const install = () => {
      const wantedSignatures = new Set(requests.map((request) => request.signature));
      for (const key of held.keys()) {
        if (!wantedSignatures.has(key)) held.delete(key);
      }

      const surfaces = new Map<string, Map<number, EmitterSurfaces>>();
      for (const { path, index, source, signature: surfaceKey } of requests) {
        const each = held.get(surfaceKey);
        if (each === undefined) continue;

        if (each.loaded.posed && !sameUnit(each.unit, bound)) {
          each.unit = bound;
          each.sampler = each.loaded.sampler(bound);
        }

        let system = surfaces.get(path);
        if (system === undefined) {
          system = new Map();
          surfaces.set(path, system);
        }
        const emitter = system.get(index) ?? { mesh: null, surface: null };
        system.set(index, { ...emitter, [source.kind]: each.sampler });
      }
      driver.setSurfaces(surfaces.size === 0 ? NO_SURFACES : surfaces);
    };

    const owed = new Map<string, SurfaceSource>();
    for (const { source, signature: surfaceKey } of requests) {
      if (!held.has(surfaceKey)) owed.set(surfaceKey, source);
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

        const [surfaceKey, loaded] = result.value;
        if (loaded !== null) {
          held.set(surfaceKey, { loaded, unit: bound, sampler: loaded.sampler(bound) });
        }
      }
      install();
    });

    return () => abort.abort();
  }, [signature, driver, pose, offset]);
}

function sameUnit(a: BoundUnit | null, b: BoundUnit | null): boolean {
  return a?.pose === b?.pose && (a?.offset ?? 0) === (b?.offset ?? 0);
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
): Promise<LoadedSource | null> {
  if (source.kind === "surface") return loadSurface(source.model, signal);

  const mesh = await bytesOf(source.model.mesh, "geometry", signal);
  if (mesh === null) return null;

  const sampler = staticMeshSurface(readMeshBuffer(mesh));
  return { posed: false, sampler: () => sampler };
}

/**
 * Loads the files of a surface. Returns null when a required file is unset or missing.
 *
 * A skinned mesh surface requires its mesh and its skeleton, because the engine ignores the
 * surface when either name is empty.
 */
async function loadSurface(
  model: EmissionSurfaceModel,
  signal: AbortSignal,
): Promise<LoadedSource | null> {
  const [mesh, skeleton] = await Promise.all([
    model.kind === "mesh" ? bytesOf(model.mesh, "geometry", signal) : null,
    bytesOf(model.skeleton, "skeleton", signal),
  ]);
  if (skeleton === null) return null;

  const joints = readSkeletonBuffer(skeleton);
  if (model.kind === "skeleton") {
    return {
      posed: true,
      sampler: (unit) => skeletonSurface(model, joints, boundJoints(joints, unit)),
    };
  }
  if (mesh === null) return null;

  const geometry = readMeshBuffer(mesh);
  return {
    posed: true,
    sampler: (unit) => meshSurface(model, geometry, joints, boundJoints(joints, unit)),
  };
}
