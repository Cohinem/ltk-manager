import { m, readOnlyDescription } from "@/i18n";

import type { ObjectGate } from "../hooks/useObjectBlock";
import type { AtlasEdit } from "../state/atlasEdit";

/** Returns the reason that the scene bin takes no edit. */
export function editReason(edit: AtlasEdit | null): string {
  if (edit?.readOnly != null) return readOnlyDescription(edit.readOnly);

  return m.workshop_bin_menu_atlas_read_only_reason();
}

/** Returns the reason that the view creates and removes no object, undefined if it does both. */
export function objectBlockReason(gate: ObjectGate, edit: AtlasEdit | null): string | undefined {
  switch (gate.block) {
    case null:
      return undefined;
    case "readOnly":
      return editReason(edit);
    case "variant":
      return m.workshop_bin_atlas_add_variant_hint();
    case "undeclared":
      return m.workshop_bin_atlas_add_undeclared_hint();
  }
}
