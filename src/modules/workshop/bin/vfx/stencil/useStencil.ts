import { use, useMemo } from "react";

import type { ValueEdit, VfxValue } from "@/lib/tauri";

import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { emitterPlace } from "../clipboard/emitterCopy";
import { holderRow } from "../drivers/utils/holderRow";
import { useForces } from "../forces/useForces";
import { useEmitters } from "../inspector/state/emitterChoice";
import { useEmitterModel } from "../inspector/state/emitterModel";
import { VfxRunContext } from "../playback/state/run";
import { type MaskUse, maskUse, type StencilMask, stencilMasks } from "./maskModel";
import { type StencilCheck, stencilChecks } from "./stencilChecks";

const NO_MASKS: readonly StencilMask[] = [];
const NO_CHECKS: readonly StencilCheck[] = [];

/** The masks of the run's system, and none outside a run. */
export function useStencilMasks(): readonly StencilMask[] {
  const system = use(VfxRunContext)?.system ?? null;
  return useMemo(() => (system === null ? NO_MASKS : stencilMasks(system)), [system]);
}

/** One mask of the run's system by its key, and undefined for a key no emitter uses. */
export function useStencilMask(key: string | null): StencilMask | undefined {
  return useStencilMasks().find((mask) => mask.key === key);
}

/** The mask the run's emitter at `listIndex` of its list uses, and null for one that uses none. */
export function useMaskUse(simple: boolean, listIndex: number): MaskUse | null {
  const system = use(VfxRunContext)?.system ?? null;
  return useMemo(() => {
    const emitter = system?.emitters.find(
      (each) => each.simple === simple && each.listIndex === listIndex,
    );
    return emitter === undefined ? null : maskUse(emitter);
  }, [system, simple, listIndex]);
}

/** The stencil checks that the inspector's emitter fails. */
export function useStencilChecks(): readonly StencilCheck[] {
  const { card, target } = useEmitters();
  const { emitterNode } = useForces();
  const emitter = useEmitterModel();
  const system = use(VfxRunContext)?.system ?? null;

  return useMemo(() => {
    if (card === undefined || target === "system" || emitterNode == null) return NO_CHECKS;
    return stencilChecks(emitterNode, { simple: card.simple, emitter, system });
  }, [card, target, emitterNode, emitter, system]);
}

/** What the stencil controls write the inspector's emitter with. */
export interface StencilEdit {
  /** The emitter's place in its list, which every edit path starts at. */
  readonly index: number;
  /** The emitter as the resolved system reads it. */
  readonly node: VfxValue | null;
  /** Apply `edits` under the emitter list's one property, as one undo step. */
  readonly apply: (edits: ValueEdit[]) => Promise<boolean>;
}

/** The edit of the inspector's emitter, and null where the document takes no edit. */
export function useStencilEdit(): StencilEdit | null {
  const { card, child, target } = useEmitters();
  const { emitterNode } = useForces();
  const editProperty = use(LeafEditContext)?.editProperty;
  const place = card === undefined ? null : emitterPlace(card.row.path);

  if (card === undefined || child !== null || target === "system") return null;
  if (place === null || editProperty === undefined) return null;

  return {
    index: place.index,
    node: emitterNode ?? null,
    apply: (edits) => editProperty(holderRow(card.row.entry, ""), place.list, edits),
  };
}
