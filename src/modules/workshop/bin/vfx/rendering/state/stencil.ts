import { useThree } from "@react-three/fiber";
import { createContext, useLayoutEffect, useMemo } from "react";
import type { Color, Material, Scene } from "three";

import type { EmitterModel } from "../../engine/model/model";
import {
  applyStencil,
  NO_STENCIL,
  type StencilClaim,
  stencilOf,
  stencilStates,
} from "../utils/stencil";

/**
 * The colour a draw path tints its emitter's stencil mask in, and null where it draws no tint.
 *
 * `VfxSystem` sets it per emitter under `masks`, for an emitter that writes a mask.
 */
export const MaskTintContext = createContext<Color | null>(null);

/** A claim and the materials its state is written onto. */
interface MaterialClaim extends StencilClaim {
  readonly materials: readonly Material[];
}

/* A reference value is shared by every emitter of a scene, across systems, so the claims are
   kept per scene rather than per system. */
const CLAIMS = new WeakMap<Scene, Set<MaterialClaim>>();

/** Write each claim's state onto its materials, from the current claims of `scene`. */
function resolve(scene: Scene): void {
  const claims = [...(CLAIMS.get(scene) ?? [])];
  const states = stencilStates(claims);

  claims.forEach((claim, at) => {
    for (const material of claim.materials) applyStencil(material, states[at]);
  });
}

/**
 * Register `claim` in `scene` until the returned call removes it.
 *
 * Every claim of the scene is resolved again when one is added or removed, because a writer
 * that is added or removed changes which testers are masked.
 */
export function claimStencil(scene: Scene, claim: MaterialClaim): () => void {
  let claims = CLAIMS.get(scene);
  if (claims === undefined) {
    claims = new Set();
    CLAIMS.set(scene, claims);
  }
  claims.add(claim);
  resolve(scene);

  return () => {
    claims.delete(claim);
    for (const material of claim.materials) applyStencil(material, NO_STENCIL);
    resolve(scene);
  };
}

/**
 * Draw `materials` under the stencil state of `emitter` while they are mounted.
 *
 * `live` is false for an emitter the draw leaves out, which then masks no other emitter.
 */
export function useStencil(
  emitter: EmitterModel,
  live: boolean,
  materials: readonly Material[],
): void {
  const scene = useThree((state) => state.scene);
  const stencil = useMemo(() => stencilOf(emitter), [emitter]);

  /* A layout effect, so the state is on the materials before the frame that first draws them. */
  useLayoutEffect(() => {
    if (stencil === null) return;
    return claimStencil(scene, { use: stencil, live, materials });
  }, [scene, stencil, live, materials]);
}

const NO_PROGRAMS: readonly { readonly material: Material }[] = [];

/** `useStencil` over a draw path's hand-written material and the programs that draw in its place. */
export function useDrawStencil(
  emitter: EmitterModel,
  live: boolean,
  solid: Material,
  programs: readonly { readonly material: Material }[] = NO_PROGRAMS,
): void {
  const materials = useMemo(
    () => [solid, ...programs.map((program) => program.material)],
    [solid, programs],
  );
  useStencil(emitter, live, materials);
}
