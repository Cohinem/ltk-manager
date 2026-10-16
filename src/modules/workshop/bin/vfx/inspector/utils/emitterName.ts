import type { EmitterRef } from "../../clipboard/emitterCopy";
import { CARD } from "./emitterGroups";
import type { EmitterCardData } from "./emitterTypes";

/** The emitter's own `emitterName`, else the name its element row carries. */
export function nameOf(card: EmitterCardData): string {
  const name = card.fields(CARD.name);
  return name?.value.type === "string" ? name.value.value : card.row.name;
}

/** Returns the emitter that `card` shows, as the clipboard's actions take it. */
export function emitterRef(card: EmitterCardData): EmitterRef {
  return { entry: card.row.entry, wire: card.row.path, name: nameOf(card) };
}
