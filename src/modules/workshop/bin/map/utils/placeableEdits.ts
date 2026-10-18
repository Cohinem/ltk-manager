import type { LeafValue, MapChunk, PropertyEdit, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { itemId } from "./mapOutline";

/** `MapPlaceableContainer.items`, which holds each placeable under its key. */
const ITEMS = nameHash("items");
/** `MapPlaceable.transform`. */
const TRANSFORM = nameHash("transform");
/** `MapPlaceable.name`. */
const NAME = nameHash("name");

/** The most staged edits one property takes, which is `MAX_PROPERTY_EDITS` of the backend. */
const EDITS_PER_PROPERTY = 64;

/** One placeable, by the chunk that holds it and its key there. */
export interface PlaceableRef {
  readonly chunk: string;
  readonly key: string;
}

/** A placeable's new `transform`, column major with the translation last. */
export interface PlaceableMove extends PlaceableRef {
  readonly transform: readonly (number | null)[];
}

/** A placeable that an edit adds, and the selection id it answers to once it lands. */
export interface NewPlaceable {
  readonly id: string;
  readonly name: string;
  readonly key: string;
}

/** The step to the map entry under `key`, a hash key's eight digits. */
function entryStep(key: string): string {
  return `{${key.slice(2)}}`;
}

/** The field segment of `field`, a hash's eight digits. */
function fieldStep(field: string): string {
  return field.slice(2);
}

/** Splits `edits` of one chunk's `items` into property edits the backend takes. */
function itemsEdits(chunk: string, edits: readonly ValueEdit[]): PropertyEdit[] {
  const out: PropertyEdit[] = [];
  for (let at = 0; at < edits.length; at += EDITS_PER_PROPERTY) {
    out.push({
      entry: chunk,
      holder: "",
      field: ITEMS,
      edits: edits.slice(at, at + EDITS_PER_PROPERTY),
    });
  }
  return out;
}

/** Groups `refs` by their chunk, in the order each chunk first appears. */
function byChunk<T extends PlaceableRef>(refs: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const ref of refs) {
    const held = out.get(ref.chunk);
    if (held === undefined) out.set(ref.chunk, [ref]);
    else held.push(ref);
  }
  return out;
}

/** `transform` as the leaf a `Mtx44` takes, whose cells are the outline's own order. */
export function matrixLeaf(transform: readonly (number | null)[]): LeafValue {
  return { type: "matrix", values: [...transform] };
}

/** Returns the edits that set the `transform` of each of `moves`. */
export function moveEdits(moves: readonly PlaceableMove[]): PropertyEdit[] {
  return moves.map((move) => ({
    entry: move.chunk,
    holder: `${fieldStep(ITEMS)}${entryStep(move.key)}`,
    field: TRANSFORM,
    edits: [{ type: "setLeaf", path: "", value: matrixLeaf(move.transform) }],
  }));
}

/** Returns the edits that remove each of `refs` from its chunk. */
export function removeEdits(refs: readonly PlaceableRef[]): PropertyEdit[] {
  return [...byChunk(refs)].flatMap(([chunk, held]) =>
    itemsEdits(
      chunk,
      held.map((ref) => ({ type: "removeItem", path: entryStep(ref.key) })),
    ),
  );
}

/** Every placeable name and key of `chunks`, which a new placeable has to stay apart from. */
export interface TakenNames {
  readonly names: Set<string>;
  readonly keys: Set<string>;
}

/** Collects the names and keys of every placeable in `chunks`. Keys are compared lowercased. */
export function takenNames(chunks: readonly MapChunk[]): TakenNames {
  const names = new Set<string>();
  const keys = new Set<string>();
  for (const chunk of chunks) {
    for (const item of chunk.items) {
      names.add(item.name.toLowerCase());
      keys.add(item.key.toLowerCase());
    }
  }
  return { names, keys };
}

/**
 * Returns the first name of the form `<stem><number>` that `taken` holds neither as a name
 * nor as a key, and records it in `taken`.
 *
 * The stem is `base` without its trailing digits, and the count starts past the number that
 * `base` ends in. The client flattens the keys of every chunk into one table, so a name whose
 * hash any chunk holds as a key is skipped.
 */
export function freeName(base: string, taken: TakenNames): NewPlaceable["name"] {
  const [, stem = base, digits = ""] = /^(.*?)(\d*)$/.exec(base) ?? [];
  let count = digits === "" ? 1 : Number(digits) + 1;

  for (;;) {
    const name = `${stem}${count}`;
    const key = nameHash(name);
    if (!taken.names.has(name.toLowerCase()) && !taken.keys.has(key)) {
      taken.names.add(name.toLowerCase());
      taken.keys.add(key);
      return name;
    }
    count += 1;
  }
}

/** A placeable to copy, with the name it reads under. */
export interface DuplicateSource extends PlaceableRef {
  readonly name: string;
}

/**
 * Returns the edits that copy each of `sources` into its own chunk under a free name, and the
 * copies they add. A copy's key is the hash of its name.
 */
export function duplicateEdits(
  sources: readonly DuplicateSource[],
  taken: TakenNames,
): { edits: PropertyEdit[]; added: NewPlaceable[] } {
  const added: NewPlaceable[] = [];
  const edits = [...byChunk(sources)].flatMap(([chunk, held]) =>
    itemsEdits(
      chunk,
      held.flatMap((source): ValueEdit[] => {
        const name = freeName(source.name, taken);
        const key = nameHash(name);
        added.push({ id: itemId(chunk, key), name, key });
        return [
          {
            type: "copyItem",
            from: entryStep(source.key),
            path: "",
            index: null,
            unique: null,
            key,
          },
          {
            type: "setLeaf",
            path: `${entryStep(key)}.${fieldStep(NAME)}`,
            value: { type: "string", value: name },
          },
        ];
      }),
    ),
  );
  return { edits, added };
}

/**
 * Returns the edits that add a placeable of `className` named `name` to `chunk`, standing at
 * `transform`. Its key is the hash of its name.
 */
export function placeEdits(
  chunk: string,
  className: string,
  name: string,
  transform: readonly (number | null)[],
): PropertyEdit[] {
  const key = nameHash(name);
  const at = entryStep(key);
  return itemsEdits(chunk, [
    { type: "insertItem", path: "", item: { index: null, key, class: className } },
    { type: "ensureProperty", path: at, field: NAME },
    { type: "setLeaf", path: `${at}.${fieldStep(NAME)}`, value: { type: "string", value: name } },
    { type: "ensureProperty", path: at, field: TRANSFORM },
    { type: "setLeaf", path: `${at}.${fieldStep(TRANSFORM)}`, value: matrixLeaf(transform) },
  ]);
}

/** A placeable to move, with its value as clipboard text. */
export interface CopiedPlaceable extends PlaceableRef {
  readonly text: string;
}

/**
 * Returns the edits that move each of `copied` into the chunk `target` under its own key, and
 * take it out of the chunk it leaves. A placeable already in `target` stays.
 */
export function moveToChunkEdits(
  copied: readonly CopiedPlaceable[],
  target: string,
): PropertyEdit[] {
  const leaving = copied.filter((each) => each.chunk !== target);
  if (leaving.length === 0) return [];

  return [
    ...itemsEdits(
      target,
      leaving.map((each) => ({
        type: "pasteItem",
        path: "",
        index: null,
        text: each.text,
        unique: null,
        key: each.key,
      })),
    ),
    ...removeEdits(leaving),
  ];
}

/** One string leaf of a map action that names a placeable, as the backend found it. */
export interface NameReference {
  readonly entry: string;
  readonly holder: string;
  readonly field: string;
}

/**
 * Returns the edits that rename the placeable `ref` to `name`, and point every one of
 * `references` at the new name. The key stays unchanged.
 */
export function renameEdits(
  ref: PlaceableRef,
  name: string,
  references: readonly NameReference[],
): PropertyEdit[] {
  const value: LeafValue = { type: "string", value: name };
  return [
    {
      entry: ref.chunk,
      holder: `${fieldStep(ITEMS)}${entryStep(ref.key)}`,
      field: NAME,
      edits: [{ type: "setLeaf", path: "", value }],
    },
    ...references.map((reference) => ({
      entry: reference.entry,
      holder: reference.holder,
      field: reference.field,
      edits: [{ type: "setLeaf" as const, path: "", value }],
    })),
  ];
}
