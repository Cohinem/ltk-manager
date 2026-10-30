import type { BankEdit, EventNode, NodeParent, ObjectProperties } from "@/lib/tauri";

import type { BankRevision } from "../api/queries";
import type { NodeTarget } from "./nodeBatch";
import type { FieldTarget } from "./nodeFields";
import { rowAction, voiceParent, type VoiceRow } from "./voices";

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

/**
 * Returns `true` if a child is added to `node`: a random, sequence or switch container, or an
 * actor-mixer. A layer container names its children in its layers.
 */
export function takesChild(node: EventNode): boolean {
  return node.kind === "random" || node.kind === "mixer" || node.kind === "switch";
}

/** Returns `true` if the object `id` takes edits in `editing`. */
export function isEditable(editing: TreeEditing | null, id: number): boolean {
  return editing?.properties.get(id)?.editable === true;
}

/**
 * Returns the object that the row `row` stands for, and the object above it.
 *
 * Returns null for a row without an object of the bank: a switch state that is not one
 * container, a missing or unsupported node, an add row or the state of a fetch.
 */
export function voiceTarget(row: VoiceRow): NodeTarget | null {
  if (row.kind === "event") {
    return { object: row.event.id, parent: null, parentKind: null, kind: "event", ancestors: [] };
  }

  const action = rowAction(row);
  if (action !== null) {
    return {
      object: action.id,
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
