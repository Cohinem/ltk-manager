import type { EventAction, EventNode, ObjectProperties, PlayMode } from "@/lib/tauri";

import { type FieldOwner, type NodeField, nodeFields } from "./nodeFields";
import { type ContainerNode, voiceParent, type VoiceRow } from "./voices";

/** A read-only fact of a container that the inspector lists after its fields. */
export type InspectorFact =
  | { readonly kind: "playlist"; readonly mode: PlayMode }
  /** `weighted` is `true` if the random pick reads the weights. */
  | { readonly kind: "pick"; readonly weighted: boolean }
  /** The ID of the switch group or state group of a switch container. */
  | { readonly kind: "switchGroup"; readonly id: number }
  | { readonly kind: "defaultSwitch"; readonly id: number };

/** The fields and the facts of one object of the inspector. */
export interface InspectorSection {
  readonly owner: FieldOwner;
  readonly fields: readonly NodeField[];
  readonly facts: readonly InspectorFact[];
}

/** Returns the facts of `node` that are not fields: the playlist mode, the pick and the switch. */
function factsOf(
  node: EventNode,
  properties: ReadonlyMap<number, ObjectProperties>,
): InspectorFact[] {
  if (node.kind === "random") {
    const weighted = properties.get(node.id)?.weights?.weighted === true;
    return [
      { kind: "playlist", mode: node.mode },
      { kind: "pick", weighted },
    ];
  }
  if (node.kind === "switch") {
    return [
      { kind: "switchGroup", id: node.group },
      { kind: "defaultSwitch", id: node.defaultSwitch },
    ];
  }

  return [];
}

function nodeSection(
  node: EventNode,
  parent: ContainerNode | null,
  properties: ReadonlyMap<number, ObjectProperties>,
): InspectorSection {
  return {
    owner: { kind: "node", node },
    fields: nodeFields({ kind: "node", node }, properties, parent),
    facts: factsOf(node, properties),
  };
}

function actionSection(
  action: EventAction,
  properties: ReadonlyMap<number, ObjectProperties>,
): InspectorSection {
  return {
    owner: { kind: "action", action },
    fields: nodeFields({ kind: "action", action }, properties, null),
    facts: [],
  };
}

/**
 * Returns the objects that the inspector lists for `row`, the row's own object first.
 *
 * A voice lists its sound, and an action row its action. A header lists its container, the header
 * of a Play action that action, and a switch state that is not one container its switch. An event
 * lists each Play action. Every other row lists nothing. Per "Inspector" in docs/ux/AUDIO.md.
 */
export function inspectorSections(
  row: VoiceRow,
  properties: ReadonlyMap<number, ObjectProperties>,
): InspectorSection[] {
  switch (row.kind) {
    case "voice": {
      const { voice } = row.line;
      return [nodeSection(voice.node, voiceParent(voice), properties)];
    }
    case "action":
      return [actionSection(row.action, properties)];
    case "group": {
      const { group } = row;
      if (group.actionHeader) return [actionSection(group.play, properties)];
      if (group.container !== null) {
        return [nodeSection(group.container, voiceParent(group), properties)];
      }

      const above = group.path.at(-2)?.container ?? null;
      return group.state === null ? [] : [nodeSection(group.state.switch, above, properties)];
    }
    case "event":
      return row.plays.map((action) => actionSection(action, properties));
    default:
      return [];
  }
}

/** Returns `true` if `field` sets a property, which an edit of several picks applies to each. */
function isProperty(field: NodeField): boolean {
  return field.target.kind === "property";
}

/**
 * Returns the fields that `lists` share, with the values of the first list.
 *
 * One list keeps every field. Several keep the properties that every list holds, as an edit of a
 * picked object applies only a property to the other picks.
 */
export function sharedFields(lists: readonly (readonly NodeField[])[]): NodeField[] {
  const [first, ...rest] = lists;
  if (first === undefined) return [];
  if (rest.length === 0) return [...first];

  return first.filter(
    (field) =>
      isProperty(field) &&
      rest.every((list) => list.some((other) => isProperty(other) && other.name === field.name)),
  );
}
