import { m } from "@/i18n";

import type { EmitterModel } from "../engine/model/model";
import type { MaskName, MaskRole, StencilMask } from "./maskModel";

/** A mask as a short name: its number, or its `StencilReferenceId`. */
export function maskShort(mask: MaskName): string {
  return mask.id ?? String(mask.ref);
}

/** A mask as a picker names it. */
export function maskLabel(mask: MaskName): string {
  return m.workshop_bin_stencil_mask_label({ mask: maskShort(mask) });
}

/** The emitters' names as one comma-separated line. */
export function emitterNames(emitters: readonly EmitterModel[]): string {
  return emitters.map((emitter) => emitter.name).join(", ");
}

/** Which emitters write `mask`, as a picker's second line. */
export function writersLine(mask: StencilMask): string {
  if (mask.writers.length === 0) return m.workshop_bin_stencil_mask_unwritten_description();
  return m.workshop_bin_stencil_mask_writers_description({ names: emitterNames(mask.writers) });
}

/** What an emitter of `role` does with `mask`, as one line. */
export function roleLine(role: MaskRole, mask: MaskName): string {
  const named = { mask: maskShort(mask) };
  switch (role) {
    case "writes":
      return m.workshop_bin_stencil_mark_writes_label(named);
    case "inside":
      return m.workshop_bin_stencil_mark_inside_label(named);
    case "outside":
      return m.workshop_bin_stencil_mark_outside_label(named);
    case "writesOutside":
      return m.workshop_bin_stencil_mark_writes_outside_label(named);
  }
}
