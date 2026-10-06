import {
  AlwaysStencilFunc,
  EqualStencilFunc,
  KeepStencilOp,
  type Material,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  type StencilFunc,
  type StencilOp,
} from "three";

import { STENCIL_MODE, type StencilMode } from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";

/** The stencil bits the engine compares and writes. Two references equal modulo 64 are one. */
export const STENCIL_BITS = 0x3f;

/** The value the first `StencilReferenceId` of a scene takes. Each later one takes one less. */
const FIRST_NAMED_REFERENCE = 63;

/** An emitter's enabled stencil mode and the reference it names. */
export interface StencilUse {
  readonly mode: Exclude<StencilMode, typeof STENCIL_MODE.disabled>;
  /** `stencilRef`, which `id` replaces where it is set. */
  readonly ref: number;
  /** `StencilReferenceId`, and null for an emitter naming its reference by number. */
  readonly id: string | null;
}

/**
 * The stencil use of `emitter`, and null for one that draws with no stencil state.
 *
 * A resolved custom material replaces the emitter's stencil fields with its own passes' state,
 * which the preview does not read.
 */
export function stencilOf(emitter: EmitterModel): StencilUse | null {
  if (emitter.stencilMode === STENCIL_MODE.disabled) return null;
  if (emitter.customMaterial != null && !emitter.customMaterial.missing) return null;

  return { mode: emitter.stencilMode, ref: emitter.stencilRef, id: emitter.stencilReferenceId };
}

/** The mode writes its reference into the buffer where the emitter draws. */
export function writesStencil(use: StencilUse): boolean {
  return use.mode === STENCIL_MODE.writeMask || use.mode === STENCIL_MODE.writeMaskIfTestNotEqual;
}

/** The stencil properties of a ThreeJS material. `stencilWrite` enables the test. */
export interface StencilState {
  readonly stencilWrite: boolean;
  readonly stencilFunc: StencilFunc;
  readonly stencilRef: number;
  readonly stencilFuncMask: number;
  readonly stencilWriteMask: number;
  readonly stencilFail: StencilOp;
  readonly stencilZFail: StencilOp;
  readonly stencilZPass: StencilOp;
}

/** The state of a material that neither tests nor writes, which is the ThreeJS default. */
export const NO_STENCIL: StencilState = {
  stencilWrite: false,
  stencilFunc: AlwaysStencilFunc,
  stencilRef: 0,
  stencilFuncMask: 0xff,
  stencilWriteMask: 0xff,
  stencilFail: KeepStencilOp,
  stencilZFail: KeepStencilOp,
  stencilZPass: KeepStencilOp,
};

/** The compare each mode runs, per `stencilMode` on the meta wiki's `VfxEmitterDefinitionData`. */
const COMPARE: Record<StencilUse["mode"], StencilFunc> = {
  [STENCIL_MODE.writeMask]: AlwaysStencilFunc,
  [STENCIL_MODE.testEqual]: EqualStencilFunc,
  [STENCIL_MODE.testNotEqual]: NotEqualStencilFunc,
  [STENCIL_MODE.writeMaskIfTestNotEqual]: NotEqualStencilFunc,
};

/** The state `use` draws under against the reference value `reference`. */
export function stencilState(use: StencilUse, reference: number): StencilState {
  return {
    stencilWrite: true,
    stencilFunc: COMPARE[use.mode],
    stencilRef: reference & STENCIL_BITS,
    stencilFuncMask: STENCIL_BITS,
    stencilWriteMask: STENCIL_BITS,
    stencilFail: KeepStencilOp,
    stencilZFail: KeepStencilOp,
    stencilZPass: writesStencil(use) ? ReplaceStencilOp : KeepStencilOp,
  };
}

/** One emitter's use of a scene's stencil buffer, and whether the emitter draws. */
export interface StencilClaim {
  readonly use: StencilUse;
  /** False for an emitter that is muted, left out of a solo or disabled. */
  readonly live: boolean;
}

/**
 * The reference value of each claim, in the order of `claims`.
 *
 * A numbered reference is its low six bits. Each distinct `StencilReferenceId` takes a value
 * counting down from 63 in the order it first appears, and wraps past 64 ids, as the engine
 * allocates them per frame in draw order.
 */
export function stencilReferences(claims: readonly StencilClaim[]): number[] {
  const named = new Map<string, number>();

  return claims.map(({ use }) => {
    if (use.id === null) return use.ref & STENCIL_BITS;

    let value = named.get(use.id);
    if (value === undefined) {
      value = (FIRST_NAMED_REFERENCE - named.size) & STENCIL_BITS;
      named.set(use.id, value);
    }
    return value;
  });
}

/** The value every texel of the stencil buffer has after the frame's clear. */
const CLEARED = 0;

/**
 * Some texel can pass the test of `use` against `reference`, given the values the scene writes.
 *
 * A writing mode always can. `TestEqual` can where its reference is written or is the cleared
 * value. `TestNotEqual` can where its reference is not the cleared value, or anything is written.
 */
function canPass(use: StencilUse, reference: number, written: ReadonlySet<number>): boolean {
  if (writesStencil(use)) return true;
  if (use.mode === STENCIL_MODE.testEqual) return reference === CLEARED || written.has(reference);
  return reference !== CLEARED || written.size > 0;
}

/**
 * The state each claim's materials draw under, in the order of `claims`.
 *
 * A claim draws untested where no live claim of the scene writes a value its test can pass
 * against, because the engine's writer is then outside the scene. Decision 2.53 of
 * docs/plans/vfx-particle-renderer.md.
 */
export function stencilStates(claims: readonly StencilClaim[]): StencilState[] {
  const references = stencilReferences(claims);
  const written = new Set<number>();
  claims.forEach((claim, at) => {
    if (claim.live && writesStencil(claim.use)) written.add(references[at]);
  });

  return claims.map((claim, at) => {
    const reference = references[at];
    const tested = claim.live && canPass(claim.use, reference, written);
    return tested ? stencilState(claim.use, reference) : NO_STENCIL;
  });
}

/** Write `state` onto `material`. ThreeJS reads these properties at each draw. */
export function applyStencil(material: Material, state: StencilState): void {
  Object.assign(material, state);
}
