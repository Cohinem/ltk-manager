import type { ValueEdit } from "@/lib/tauri";

import type { GraphItem, StructItem } from "./graphItems";
import { FORCE_FIELD } from "./renderSection";

/**
 * How a node's value leaves the file: as an item of its list or map, or as a field of its
 * holder, which then reads its class default. Null for a node that stands for no value of
 * its own, such as an emitter, whose clipboard removes it, or a Texture node.
 */
export interface NodeRemoval {
  readonly type: "item" | "property";
  /** The wire path of the value. */
  readonly path: string;
}

/** One `editProperty` call: the holder by wire path, its field, and the edits under it. */
export interface PropertyEdit {
  readonly holder: string;
  readonly field: string;
  readonly edits: ValueEdit[];
}

/** A wire path ending in a list item: the holder, the list's field and the item's place. */
const LIST_ITEM = /^(?:(.*)\.)?([0-9a-f]{8})\[(\d+)\]$/i;

/** A force's wire path: an item of one of the lists under the emitter's force collection. */
const FORCE_ITEM = new RegExp(`\\.${FORCE_FIELD.slice(2)}\\.[0-9a-f]{8}\\[\\d+\\]$`, "i");

/** Whether a node stands for a force, which its menu names as one. */
export function isForce(item: GraphItem): boolean {
  return item.type === "struct" && FORCE_ITEM.test(item.wire);
}

/** The removal a node's Delete sends, or null where the node has no value to remove. */
export function nodeRemoval(item: GraphItem): NodeRemoval | null {
  if (item.type !== "struct" && item.type !== "value" && item.type !== "file") return null;
  if (item.wire === "") return null;

  const last = item.wire.at(-1);
  return { type: last === "]" || last === "}" ? "item" : "property", path: item.wire };
}

/** The copy a list item node's Duplicate lands right after it, or null for any other node. */
export function nodeDuplicate(item: GraphItem): PropertyEdit | null {
  if (item.type !== "struct" && item.type !== "value" && item.type !== "file") return null;

  const match = LIST_ITEM.exec(item.wire);
  if (match === null) return null;

  const index = Number(match[3]);
  return {
    holder: match[1] ?? "",
    field: `0x${match[2]!.toLowerCase()}`,
    edits: [{ type: "copyItem", from: `[${index}]`, path: "", index: index + 1, unique: null }],
  };
}

/**
 * The item a list node's Add item appends, or null for a node that is no list field.
 *
 * A list of structs takes a new item of its last item's class, and any other list an item at
 * its type's default.
 */
export function listAppend(item: StructItem): PropertyEdit | null {
  if (item.shape !== "list" || item.field === null) return null;

  const last = item.rows.at(-1)?.input;
  const itemClass = last?.type === "struct" || last?.type === "value" ? last.classHash : null;
  return {
    holder: item.holder,
    field: item.field,
    edits: [{ type: "insertItem", path: "", item: { index: null, key: null, class: itemClass } }],
  };
}
