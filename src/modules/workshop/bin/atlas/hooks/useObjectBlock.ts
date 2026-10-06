import type { ReadOnly } from "@/lib/tauri";

import { useDeclaredState } from "../../documents/hooks/useDeclared";
import { useAtlasEdit } from "../state/atlasEdit";
import { useViewVariant } from "../state/atlasPreview";

/** Why a view creates and removes no object: no edits, a drawn variant, or a file not declared. */
export type ObjectBlock = "readOnly" | "variant" | "undeclared";

export interface ObjectGate {
  /** Why no object is created or removed, and null where the scene bin does both. */
  readonly block: ObjectBlock | null;
  /** Why the scene bin takes no edits, where its open says. */
  readonly readOnly: ReadOnly | null;
}

/** Whether the view `view` creates and removes objects, as only a declared base document does (ADR-0049). */
export function useObjectBlock(view: string): ObjectGate {
  const edit = useAtlasEdit();
  const variant = useViewVariant(view);
  const declared = useDeclaredState(edit?.scene ?? null);

  return {
    block: blockOf(edit?.editable ?? false, variant !== null, declared !== null),
    readOnly: edit?.readOnly ?? null,
  };
}

function blockOf(editable: boolean, variantDrawn: boolean, declared: boolean): ObjectBlock | null {
  if (variantDrawn) return "variant";
  if (!editable) return "readOnly";
  return declared ? null : "undeclared";
}
