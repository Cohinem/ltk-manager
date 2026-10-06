import { m } from "@/i18n";

import { NoteList } from "../inspector/components/NoteList";
import type { StencilCheck } from "./stencilChecks";
import { useStencilChecks } from "./useStencil";

/**
 * The failed stencil checks of the inspector's emitter, one line each.
 *
 * "The stencil" in docs/ux/BIN_EDITOR.md.
 */
export function StencilNotes() {
  const notes = useStencilChecks().map((check) => ({
    id: check.id,
    tone: check.tone,
    text: checkText(check),
  }));

  return <NoteList notes={notes} name="StencilNotes" />;
}

function checkText(check: StencilCheck): string {
  switch (check.id) {
    case "simpleIgnored":
      return m.workshop_bin_stencil_check_simple_ignored_hint();
    case "materialIgnored":
      return m.workshop_bin_stencil_check_material_ignored_hint();
    case "idWithoutMode":
      return m.workshop_bin_stencil_check_id_without_mode_hint();
    case "refReplaced":
      return m.workshop_bin_stencil_check_ref_replaced_hint();
    case "refWraps":
      return m.workshop_bin_stencil_check_ref_wraps_hint({
        ref: String(check.ref),
        reads: String(check.reads),
      });
    case "noWriter":
      return check.role === "inside"
        ? m.workshop_bin_stencil_check_no_writer_inside_hint()
        : m.workshop_bin_stencil_check_no_writer_outside_hint();
    case "writerLater":
      return m.workshop_bin_stencil_check_writer_later_hint({ writer: check.writer });
    case "noTester":
      return m.workshop_bin_stencil_check_no_tester_hint();
  }
}
