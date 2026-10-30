import type { BankEdit, EventNode, NodeParent, ObjectProperties } from "@/lib/tauri";

import type { BankRevision } from "../api/queries";
import { childrenOf, type EventRow } from "./eventTree";
import type { NodeTarget } from "./nodeBatch";
import type { FieldTarget } from "./nodeFields";
import { voiceParent, type VoiceRow } from "./voices";

/** What the event tree edits through: the open document, the values, and the edit call. */
export interface TreeEditing {
  readonly revision: BankRevision;
  /** The properties of the objects of the open trees, by object ID. */
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  /** The IDs of the objects whose bytes differ from the bank as it was opened. */
  readonly edited: ReadonlySet<number>;
  /** Applies one edit. Resolves false if the backend refused it. */
  readonly edit: (edit: BankEdit) => Promise<boolean>;
  /** Adds the WEM file at `file` as a new sound under `parent`. Resolves false if refused. */
  readonly importWem: (parent: NodeParent, file: string) => Promise<boolean>;
  /**
   * Returns `true` if the field `target` takes no edit, because it is picked with other objects
   * and one of them does not take the property.
   */
  readonly locked: (target: FieldTarget) => boolean;
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

/**
 * Returns `true` if a child is added to `node`: a random, sequence or switch container, or an
 * actor-mixer. A layer container names its children in its layers.
 */
export function takesChild(node: EventNode): boolean {
  return node.kind === "random" || node.kind === "mixer" || node.kind === "switch";
}

/** Returns the object IDs of the children of `node`. */
export function childIds(node: EventNode): Set<number> {
  return new Set(childrenOf(node).map((child) => child.id));
}

/** Returns `true` if the object `id` takes edits in `editing`. */
export function isEditable(editing: TreeEditing | null, id: number): boolean {
  return editing?.properties.get(id)?.editable === true;
}

/**
 * Returns the object that the Structure row `row` stands for, and the object above it.
 *
 * Returns null for a row without an object of the bank: a field, a children or add row, a
 * missing or unsupported node.
 */
export function rowTarget(row: EventRow, byKey: ReadonlyMap<string, EventRow>): NodeTarget | null {
  const holders: Holder[] = [];
  let above = row.parent === null ? undefined : byKey.get(row.parent);
  while (above !== undefined) {
    const holder = holderOf(above);
    if (holder !== null) holders.unshift(holder);
    above = above.parent === null ? undefined : byKey.get(above.parent);
  }

  const ancestors = holders.map((holder) => holder.id);
  const nearest = holders.at(-1);
  const parent = nearest?.id ?? null;
  const parentKind = nearest?.kind ?? null;
  if (row.kind === "event") {
    return { object: row.event.id, parent: null, parentKind: null, kind: "event", ancestors };
  }
  if (row.kind === "action") {
    return { object: row.action.id, parent, parentKind, kind: "action", ancestors };
  }

  const object = rowObject(row);
  if (row.kind !== "node" || object === null) return null;

  const kind = row.node.kind === "sound" ? "sound" : "container";
  return { object, parent, parentKind, kind, ancestors };
}

/** An object that a row above a node stands for. */
interface Holder {
  readonly id: number;
  readonly kind: "event" | "action" | "container";
}

/** Returns the object that a row above a node stands for: an event, an action or a container. */
function holderOf(row: EventRow): Holder | null {
  if (row.kind === "event") return { id: row.event.id, kind: "event" };
  if (row.kind === "children") return { id: row.node.id, kind: "container" };

  return row.kind === "action" ? { id: row.action.id, kind: "action" } : null;
}

/** Returns the object that the Voices row `row` stands for, and the object above it. */
export function voiceTarget(row: VoiceRow): NodeTarget | null {
  if (row.kind === "event") {
    return { object: row.event.id, parent: null, parentKind: null, kind: "event", ancestors: [] };
  }
  if (row.kind === "group" && row.group.container === null) {
    return {
      object: row.group.play.id,
      parent: row.eventId,
      parentKind: "event",
      kind: "action",
      ancestors: [row.eventId],
    };
  }

  const placed =
    row.kind === "voice" && row.line.voice.node.kind === "sound"
      ? { object: row.line.voice.node.id, kind: "sound" as const, at: row.line.voice }
      : row.kind === "group" && row.group.container !== null
        ? { object: row.group.container.id, kind: "container" as const, at: row.group }
        : null;
  if (placed === null) return null;

  const { at } = placed;
  const above = voiceParent(at);
  const path = at.path.map((step) => step.container.id);
  return {
    object: placed.object,
    parent: above?.id ?? at.play.id,
    parentKind: above === null ? "action" : "container",
    kind: placed.kind,
    ancestors: [row.eventId, at.play.id, ...path],
  };
}
