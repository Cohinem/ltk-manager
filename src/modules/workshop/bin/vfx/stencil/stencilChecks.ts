import type { VfxValue } from "@/lib/tauri";

import { STENCIL_MODE } from "../engine/model/enums";
import type { EmitterModel, SystemModel } from "../engine/model/model";
import { field, nameId, number } from "../engine/parsing/readValue";
import { compareDrawOrder } from "../rendering/utils/drawKind";
import { STENCIL_BITS } from "../rendering/utils/stencil";
import { maskUse, stencilMasks } from "./maskModel";
import { STENCIL_FIELD } from "./stencilEdits";

/**
 * One finding about an emitter's stencil fields.
 *
 * A `warning` is a state in which the game ignores the fields or the mask does not apply. An
 * `info` states an engine rule or a limit of the preview that the rows do not show.
 */
export type StencilCheck =
  | { readonly id: "simpleIgnored"; readonly tone: "warning" }
  | { readonly id: "materialIgnored"; readonly tone: "warning" }
  | { readonly id: "idWithoutMode"; readonly tone: "info" }
  | { readonly id: "refReplaced"; readonly tone: "info" }
  | { readonly id: "refWraps"; readonly tone: "info"; readonly ref: number; readonly reads: number }
  | { readonly id: "noWriter"; readonly tone: "info"; readonly role: "inside" | "outside" }
  | { readonly id: "writerLater"; readonly tone: "warning"; readonly writer: string }
  | { readonly id: "noTester"; readonly tone: "info" };

/** The inputs of the checks other than the emitter's own fields. */
export interface StencilCheckContext {
  /** The emitter is in the simple emitter list. */
  readonly simple: boolean;
  /** The run's model of the emitter. Undefined outside a run. */
  readonly emitter: EmitterModel | undefined;
  /** The run's system. Null outside a run. */
  readonly system: SystemModel | null;
}

/**
 * The checks that `node` fails. `node` is one emitter of a resolved system.
 *
 * Each check applies a rule from `stencilMode`, `stencilRef`, `StencilReferenceId` and
 * `CustomMaterial` on the meta wiki's page for `VfxEmitterDefinitionData`. "The stencil" in
 * docs/ux/BIN_EDITOR.md.
 */
export function stencilChecks(node: VfxValue | null, context: StencilCheckContext): StencilCheck[] {
  const mode = number(field(node, STENCIL_FIELD.mode)) ?? STENCIL_MODE.disabled;
  const ref = number(field(node, STENCIL_FIELD.ref)) ?? 0;
  const id = nameId(field(node, STENCIL_FIELD.id));

  if (mode === STENCIL_MODE.disabled) {
    return id === null ? [] : [{ id: "idWithoutMode", tone: "info" }];
  }
  if (context.simple) return [{ id: "simpleIgnored", tone: "warning" }];

  const material = context.emitter?.customMaterial ?? null;
  if (material !== null && !material.missing) return [{ id: "materialIgnored", tone: "warning" }];

  const checks: StencilCheck[] = [];
  if (id !== null && ref !== 0) checks.push({ id: "refReplaced", tone: "info" });
  if (id === null && ref > STENCIL_BITS) {
    checks.push({ id: "refWraps", tone: "info", ref, reads: ref & STENCIL_BITS });
  }

  return [...checks, ...maskChecks(context)];
}

/** The checks of the emitter against the other emitters of its system. */
function maskChecks({ emitter, system }: StencilCheckContext): StencilCheck[] {
  const use = emitter === undefined ? null : maskUse(emitter);
  if (emitter === undefined || use === null) return [];

  const mask = stencilMasks(system).find((each) => each.key === use.key);
  const writers = mask?.writers ?? [];
  const testers = mask?.testers ?? [];

  if (use.role === "writes") return testers.length === 0 ? [{ id: "noTester", tone: "info" }] : [];
  if (use.role === "writesOutside") return [];

  if (writers.length === 0) {
    /* Reference 0 is the cleared value, so a test against it needs no writer of its own. */
    const cleared = use.name.id === null && use.name.ref === 0;
    return cleared ? [] : [{ id: "noWriter", tone: "info", role: use.role }];
  }

  const first = [...writers].sort(compareDrawOrder)[0];
  if (first !== undefined && compareDrawOrder(first, emitter) > 0) {
    return [{ id: "writerLater", tone: "warning", writer: first.name }];
  }
  return [];
}
