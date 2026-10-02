import type { AddableField } from "@/lib/tauri";

import { type AddSuggestion, parseTypedField } from "../../../tree/utils/addProperty";
import { fieldGroup, GROUP_TITLE } from "./emitterGroups";
import { matchesEmitterField } from "./emitterLabels";

/**
 * What the inspector's add box lists for `text`: a typed `name: kind` field first, then the
 * declared fields it matches by label, name, hash or group, as the property search does.
 */
export function addSuggestions(fields: readonly AddableField[], text: string): AddSuggestion[] {
  const typed = parseTypedField(text);
  const query = typed === null ? text : typed.field;
  const declared = fields
    .filter((field) =>
      matchesEmitterField(
        query,
        field.hash,
        field.name ?? field.hash,
        GROUP_TITLE[fieldGroup(field.hash)](),
      ),
    )
    .map((field): AddSuggestion => ({ kind: "declared", field }));
  if (typed === null) return declared;

  const shadowed = declared.some(
    (each) =>
      each.kind === "declared" && each.field.name?.toLowerCase() === typed.field.toLowerCase(),
  );
  return shadowed ? declared : [typed, ...declared];
}
