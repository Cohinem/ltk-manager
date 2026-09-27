import type { ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";

/** The `format` the backend writes into a copied value's clipboard text. */
export const CLIPBOARD_FORMAT = "ltk-manager/bin-value";

/** The list a paste with no emitter picked lands at the end of. */
export const COMPLEX_LIST = nameHash("complexEmitterDefinitionData");

/** The class every emitter of the complex and simple lists holds. */
const EMITTER_CLASS = nameHash("VfxEmitterDefinitionData");

/** The field a copy renames apart from every other emitter of the system. */
const EMITTER_NAME = nameHash("emitterName");

/** A list item's wire path, `0a1b2c3d[4]`: the list field's hex and the index. */
const ITEM_WIRE = /^([0-9a-f]{8})\[(\d+)\]$/;

/** One emitter of a system: the system object's entry, its item wire path and its name. */
export interface EmitterRef {
  readonly entry: string;
  readonly wire: string;
  readonly name: string;
}

/** Where an emitter sits: its list field as `0x` and eight hex digits, and its index. */
export interface EmitterPlace {
  readonly list: string;
  readonly index: number;
}

/** The list and the index an emitter's wire path names, or null for any other path. */
export function emitterPlace(wire: string): EmitterPlace | null {
  const match = ITEM_WIRE.exec(wire);
  if (match === null) return null;

  return { list: `0x${match[1]}`, index: Number(match[2]) };
}

/** Whether clipboard text is an emitter a copy wrote. */
export function isEmitterCopy(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }

  if (typeof parsed !== "object" || parsed === null) return false;

  const { format, classHash } = parsed as Record<string, unknown>;
  return format === CLIPBOARD_FORMAT && classHash === EMITTER_CLASS;
}

/** The edit that copies the emitter at `index` of its list to the place after it. */
export function duplicateEdits(index: number): ValueEdit[] {
  return [
    { type: "copyItem", from: `[${index}]`, path: "", index: index + 1, unique: EMITTER_NAME },
  ];
}

/** The edit that lands a copied emitter's `text` at `index` of a list, or at its end. */
export function pasteEdits(text: string, index: number | null): ValueEdit[] {
  return [{ type: "pasteItem", path: "", index, text, unique: EMITTER_NAME }];
}
