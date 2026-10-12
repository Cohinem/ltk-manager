import { type EmitterGroup, fieldGroup } from "../../inspector/utils/emitterGroups";
import { emitterKeyOf, masterIdOf } from "../state/hoveredEmitter";
import type { GraphItem, MasterItem } from "./graphItems";
import { COMPONENT_GROUP } from "./renderSection";

/** Where the inspector shows a node of the graph. */
export interface InspectorAim {
  /** The key of the card of the emitter the node is under. */
  readonly card: string;
  /** The inspector group of the emitter's field that the node is under. */
  readonly group: EmitterGroup;
  /** The row keys to scroll to, the node's own row first and its emitter's field after. */
  readonly rows: readonly string[];
}

/** The field of an emitter that a path under the emitter starts with: eight hex digits. */
const FIELD = /^[0-9a-f]{8}/i;

/**
 * Where the inspector shows `item`, a node of the system `entry` whose emitter nodes are
 * `masters`.
 *
 * A Texture or Geometry node gathers fields of several rows, so it aims at its group alone.
 * Null for an emitter node, whose pick opens its card, and for a node under no classic emitter.
 */
export function inspectorAim(
  entry: string,
  item: GraphItem,
  masters: readonly MasterItem[],
): InspectorAim | null {
  if (item.type === "master") return null;

  const key = emitterKeyOf(entry, item.id);
  const id = key === null ? null : masterIdOf(key.simple, key.listIndex);
  const master = masters.find((each) => each.id === id);
  if (master === undefined) return null;

  const card = `${entry}:${master.wire}`;
  if (item.type === "render") return { card, group: COMPONENT_GROUP[item.role], rows: [] };

  const under = `${master.wire}.`;
  if (!item.wire.startsWith(under)) return null;

  const field = FIELD.exec(item.wire.slice(under.length))?.[0];
  if (field === undefined) return null;

  const own = `${entry}:${item.wire}`;
  const top = `${card}.${field}`;
  return {
    card,
    group: fieldGroup(`0x${field.toLowerCase()}`),
    rows: own === top ? [own] : [own, top],
  };
}
