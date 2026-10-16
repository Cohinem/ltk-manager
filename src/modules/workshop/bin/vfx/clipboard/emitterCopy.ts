import type { PropertyEdit, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { CHILD_FIELD } from "../children/childModel";
import { freeReference, type MaskName } from "../stencil/maskModel";
import { maskEdits } from "../stencil/stencilEdits";

/** The `format` the backend writes into a copied value's clipboard text. */
export const CLIPBOARD_FORMAT = "ltk-manager/bin-value";

/** The `format` of a copy of emitters and the child systems that they link. */
export const EMITTERS_FORMAT = "ltk-manager/vfx-emitters";

const EMITTERS_VERSION = 1;

/** The list of a system's complex emitters. */
export const COMPLEX_LIST = nameHash("complexEmitterDefinitionData");

/** The list of a system's simple emitters. */
export const SIMPLE_LIST = nameHash("simpleEmitterDefinitionData");

/** The hash of the `effect` field of a `VfxChildIdentifier` in decimal, the property key in a copied struct. */
const EFFECT_KEY = String(Number.parseInt(CHILD_FIELD.effect.slice(2), 16));

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

/** The edit that copies the emitter at `index` of its list to `at`, or to the end if `at` is null. */
export function duplicateEdits(index: number, at: number | null): ValueEdit[] {
  return [{ type: "copyItem", from: `[${index}]`, path: "", index: at, unique: EMITTER_NAME }];
}

/** The edit that removes the emitter at `index` of its list. */
export function removeEdits(index: number): ValueEdit[] {
  return [{ type: "removeItem", path: `[${index}]` }];
}

/** The edit that lands a copied emitter's `text` at `index` of a list, or at its end. */
export function pasteEdits(text: string, index: number | null): ValueEdit[] {
  return [{ type: "pasteItem", path: "", index, text, unique: EMITTER_NAME }];
}

/** Returns the indices of `emitters` by list, each list's indices in ascending order. */
function indicesByList(emitters: readonly EmitterRef[]): Map<string, number[]> {
  const lists = new Map<string, number[]>();
  for (const emitter of emitters) {
    const place = emitterPlace(emitter.wire);
    if (place === null) continue;

    lists.set(place.list, [...(lists.get(place.list) ?? []), place.index]);
  }

  for (const indices of lists.values()) indices.sort((left, right) => left - right);
  return lists;
}

/**
 * Returns the property edits that duplicate `emitters` of the system `entry`, one per emitter
 * list. Each copy lands right after its source, or at the end of the list if `atEnd` is set.
 */
export function duplicateAllEdits(
  entry: string,
  emitters: readonly EmitterRef[],
  atEnd: boolean,
): PropertyEdit[] {
  return [...indicesByList(emitters)].map(([field, indices]) => {
    /* From the last index down, so a copy does not shift the sources before it. */
    const edits = atEnd
      ? indices.flatMap((index) => duplicateEdits(index, null))
      : [...indices].reverse().flatMap((index) => duplicateEdits(index, index + 1));
    return { entry, holder: "", field, edits };
  });
}

/** Returns the property edits that remove `emitters` of the system `entry`, one per emitter list. */
export function removeAllEdits(entry: string, emitters: readonly EmitterRef[]): PropertyEdit[] {
  return [...indicesByList(emitters)].map(([field, indices]) => ({
    entry,
    holder: "",
    field,
    edits: [...indices].reverse().flatMap((index) => removeEdits(index)),
  }));
}

/** One copied emitter. */
export interface CopiedEmitter {
  /** The emitter list, `COMPLEX_LIST` or `SIMPLE_LIST`. */
  readonly list: string;
  /** The backend's clipboard text of the emitter. */
  readonly text: string;
  /** The `stencilRef` of the numbered mask that the emitter uses, and null for any other emitter. */
  readonly mask: number | null;
}

/** A system that a copied emitter links as a child by `effect`. */
export interface CopiedSystem {
  readonly entry: string;
  readonly name: string;
  /** The backend's clipboard text of the system object. */
  readonly text: string;
}

/** A copy of emitters. */
export interface EmitterCopies {
  /**
   * The lowercase entry of the system that the emitters were copied from. Null for a copy of one
   * emitter that the backend wrote.
   */
  readonly system: string | null;
  readonly emitters: readonly CopiedEmitter[];
  readonly systems: readonly CopiedSystem[];
}

/** Returns the clipboard text of `copies`. */
export function emitterCopiesText(copies: EmitterCopies): string {
  return JSON.stringify({ format: EMITTERS_FORMAT, version: EMITTERS_VERSION, ...copies });
}

/**
 * Reads the emitters that clipboard `text` contains. A copy of one emitter that the backend wrote
 * reads as one complex emitter. Returns null for any other text.
 */
export function readEmitterCopies(text: string): EmitterCopies | null {
  if (isEmitterCopy(text)) {
    return { system: null, emitters: [{ list: COMPLEX_LIST, text, mask: null }], systems: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const { format, version, system, emitters, systems } = parsed as Record<string, unknown>;
  if (format !== EMITTERS_FORMAT || version !== EMITTERS_VERSION) return null;
  if (!Array.isArray(emitters) || emitters.length === 0 || !emitters.every(isCopiedEmitter)) {
    return null;
  }
  if (!Array.isArray(systems) || !systems.every(isCopiedSystem)) return null;

  return { system: typeof system === "string" ? system : null, emitters, systems };
}

function isCopiedEmitter(value: unknown): value is CopiedEmitter {
  const { list, text, mask } = (value ?? {}) as Record<string, unknown>;
  return (
    (list === COMPLEX_LIST || list === SIMPLE_LIST) &&
    typeof text === "string" &&
    (mask === null || Number.isInteger(mask))
  );
}

function isCopiedSystem(value: unknown): value is CopiedSystem {
  const { entry, name, text } = (value ?? {}) as Record<string, unknown>;
  return typeof entry === "string" && typeof name === "string" && typeof text === "string";
}

/** Returns the target of each nonzero `effect` link in the backend's clipboard `text` once, as a `0x` hash. */
export function linkedSystems(text: string): string[] {
  const found = new Set<string>();
  collectLinks(JSON.parse(text), found);
  return [...found];
}

function collectLinks(node: unknown, found: Set<string>): void {
  if (typeof node !== "object" || node === null) return;

  const properties = (node as { properties?: Record<string, unknown> }).properties;
  const effect = properties?.[EFFECT_KEY] as
    | { kind?: unknown; value?: { value?: unknown } }
    | undefined;
  const link = effect?.kind === "ObjectLink" ? effect.value?.value : undefined;
  if (typeof link === "number" && link !== 0) {
    found.add(`0x${link.toString(16).padStart(8, "0")}`);
  }

  for (const value of Object.values(node)) collectLinks(value, found);
}

/**
 * Maps each numbered mask of `emitters` that a mask of `taken` also uses to the lowest free
 * reference. A mask stays unmapped if all 63 references are used.
 */
export function remappedMasks(
  emitters: readonly CopiedEmitter[],
  taken: readonly MaskName[],
): Map<number, number> {
  const own = new Set(emitters.flatMap((emitter) => (emitter.mask === null ? [] : [emitter.mask])));
  const used: MaskName[] = [...taken, ...[...own].map((ref) => ({ id: null, ref }))];
  const remapped = new Map<number, number>();

  for (const ref of own) {
    if (!taken.some((mask) => mask.id === null && mask.ref === ref)) continue;

    const free = freeReference(used);
    if (free === null) continue;

    remapped.set(ref, free);
    used.push({ id: null, ref: free });
  }
  return remapped;
}

/**
 * Returns the property edits that land `emitters` in the system `entry`, one per emitter list.
 *
 * The emitters of one list land in order from `start(list)`. If `masks` maps an emitter's mask,
 * the edits write the mapped value to the emitter's `stencilRef`.
 */
export function landingPropertyEdits(
  entry: string,
  emitters: readonly CopiedEmitter[],
  start: (list: string) => number,
  masks: ReadonlyMap<number, number>,
): PropertyEdit[] {
  const lists = new Map<string, ValueEdit[]>();
  for (const emitter of emitters) {
    const edits = lists.get(emitter.list) ?? [];
    lists.set(emitter.list, edits);

    const index = start(emitter.list) + edits.filter((edit) => edit.type === "pasteItem").length;
    const ref = emitter.mask === null ? undefined : masks.get(emitter.mask);
    edits.push(...pasteEdits(emitter.text, index));
    if (ref !== undefined) edits.push(...maskEdits(index, { id: null, ref }, null));
  }

  return [...lists].map(([field, edits]) => ({ entry, holder: "", field, edits }));
}
