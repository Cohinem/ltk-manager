import type { BankEdit, EventNode, ObjectProperties } from "@/lib/tauri";

import type { BankRevision } from "../api/queries";
import { childrenOf, type EventRow } from "./eventTree";

/** What the event tree edits through: the open document, the values, and the edit call. */
export interface TreeEditing {
  readonly revision: BankRevision;
  /** The properties of the objects of the open trees, by object ID. */
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  /** The IDs of the objects whose bytes differ from the bank as it was opened. */
  readonly edited: ReadonlySet<number>;
  /** Applies one edit. Resolves false if the backend refused it. */
  readonly edit: (edit: BankEdit) => Promise<boolean>;
}

/** Returns the object ID of an action row or a sound or container row, or null. */
export function rowObject(row: EventRow): number | null {
  if (row.kind === "action") return row.action.id;
  if (row.kind !== "node") return null;
  if (row.node.kind === "missing" || row.node.kind === "unsupported") return null;

  return row.node.id;
}

/** Returns the container whose children row is `parent`, or null for any other row. */
export function containerOf(parent: EventRow | undefined): EventNode | null {
  return parent?.kind === "children" ? parent.node : null;
}

/** Returns `true` if a child is added to `node`: a random container or an actor-mixer. */
export function takesChild(node: EventNode): boolean {
  return node.kind === "random" || node.kind === "mixer";
}

/** Returns the object IDs of the children of `node`. */
export function childIds(node: EventNode): Set<number> {
  return new Set(childrenOf(node).map((child) => child.id));
}

/** Returns `true` if the object `id` takes edits in `editing`. */
export function isEditable(editing: TreeEditing | null, id: number): boolean {
  return editing?.properties.get(id)?.editable === true;
}
