import type { KnobRange } from "@/components";
import type { BankEdit, EventAction, EventNode, NodeProperty, ObjectProperties } from "@/lib/tauri";

import {
  formatValue,
  parseId,
  parseValue,
  parseWeight,
  PROPERTY_DEFAULTS,
  weightText,
} from "./bankEdits";

/** The name of a field row: an ID that the object points at, a property, or a playlist weight. */
export type FieldName = "target" | "source" | NodeProperty | "weight";

/** The kind of a field's value in the bank, in ritobin's words as the bin tree writes them. */
export type FieldTag = "u32" | "i32" | "f32";

/** What an edit of a field changes, which `fieldEdit` turns into a `BankEdit`. */
export type FieldTarget =
  | { readonly kind: "target"; readonly action: number }
  | { readonly kind: "source"; readonly sound: number }
  | { readonly kind: "property"; readonly object: number; readonly property: NodeProperty }
  | { readonly kind: "weight"; readonly container: number; readonly child: number };

/** One field of an action or a node, as a child row draws it. */
export interface NodeField {
  readonly name: FieldName;
  readonly tag: FieldTag;
  /** The value in the unit that the row shows: seconds for a delay, Wwise's weight. */
  readonly value: number;
  /** `true` if the object is in the opened bank at version 145, which an edit changes. */
  readonly editable: boolean;
  readonly target: FieldTarget;
}

/** The object whose fields a row lists: an action, or a node of the event tree. */
export type FieldOwner =
  | { readonly kind: "action"; readonly action: EventAction }
  | { readonly kind: "node"; readonly node: EventNode };

const MS_PER_SECOND = 1000;

/** The kind of each property in the bank, per the property table of `ltk_wwise`. */
const PROPERTY_TAGS: Readonly<Record<NodeProperty, FieldTag>> = {
  volume: "f32",
  makeUpGain: "f32",
  pitch: "f32",
  lpf: "f32",
  hpf: "f32",
  delay: "f32",
  loopCount: "i32",
};

/**
 * Returns the fields of `owner` in the order that its child rows list them.
 *
 * An action lists its target and its delay, a sound its source, and a sound or a container the
 * properties of `properties`. A child of `container` adds its playlist weight. An action whose
 * properties were not read lists its target and delay as read-only.
 */
export function nodeFields(
  owner: FieldOwner,
  properties: ReadonlyMap<number, ObjectProperties>,
  container: EventNode | null,
): NodeField[] {
  if (owner.kind === "action") return actionFields(owner.action, properties.get(owner.action.id));

  const { node } = owner;
  if (node.kind === "missing" || node.kind === "unsupported") return [];

  const own = properties.get(node.id);
  const editable = own?.editable === true;
  const fields: NodeField[] = [];
  if (node.kind === "sound") {
    fields.push({
      name: "source",
      tag: "u32",
      value: node.source,
      editable,
      target: { kind: "source", sound: node.id },
    });
  }

  for (const { property, value } of own?.values ?? []) {
    fields.push(propertyField(node.id, property, value, editable));
  }

  const weight = container === null ? null : weightField(node.id, container, properties);
  if (weight !== null) fields.push(weight);

  return fields;
}

function actionFields(action: EventAction, own: ObjectProperties | undefined): NodeField[] {
  const editable = own?.editable === true;
  const fields: NodeField[] = [];
  if (action.target !== null) {
    fields.push({
      name: "target",
      tag: "u32",
      value: action.target,
      editable,
      target: { kind: "target", action: action.id },
    });
  }

  const delay = own?.values.find((value) => value.property === "delay");
  fields.push({
    ...propertyField(action.id, "delay", delay?.value ?? action.delay / MS_PER_SECOND, editable),
    tag: "i32",
  });

  return fields;
}

function propertyField(
  object: number,
  property: NodeProperty,
  value: number | null,
  editable: boolean,
): NodeField {
  return {
    name: property,
    tag: PROPERTY_TAGS[property],
    value: value ?? PROPERTY_DEFAULTS[property],
    editable,
    target: { kind: "property", object, property },
  };
}

/** Returns the playlist weight of `child` in `container`, or null if its playlist omits it. */
function weightField(
  child: number,
  container: EventNode,
  properties: ReadonlyMap<number, ObjectProperties>,
): NodeField | null {
  const held = properties.get(container.id);
  const item = held?.weights?.items.find((each) => each.child === child);
  if (held === undefined || item === undefined) return null;

  return {
    name: "weight",
    tag: "u32",
    value: Number(weightText(item.weight)),
    editable: held.editable,
    target: { kind: "weight", container: container.id, child },
  };
}

/** Returns the edit that sets `field` to `value`, in the unit that the row shows. */
export function fieldEdit(field: NodeField, value: number): BankEdit {
  const { target } = field;
  switch (target.kind) {
    case "target":
      return { kind: "target", action: target.action, target: value };
    case "source":
      return { kind: "source", sound: target.sound, source: value };
    case "property":
      return { kind: "property", object: target.object, property: target.property, value };
    case "weight":
      return {
        kind: "weight",
        container: target.container,
        child: target.child,
        weight: parseWeight(String(value)) ?? 0,
      };
  }
}

/** Returns the value that `text` holds for `field`, or null if the text holds none. */
export function parseField(field: NodeField, text: string): number | null {
  const { target } = field;
  switch (target.kind) {
    case "target":
    case "source":
      return parseId(text);
    case "property":
      return parseValue(text, target.property);
    case "weight": {
      const stored = parseWeight(text);
      return stored === null ? null : Number(weightText(stored));
    }
  }
}

/** Returns the text of the value of `field`: an ID in decimal, a number with three decimals. */
export function fieldText(field: NodeField): string {
  if (field.tag === "u32" && field.name !== "weight") return String(field.value);

  return formatValue(field.value);
}

/**
 * The span of a gain knob in dB. Neither Wwise's property table in `ltk_wwise` nor its design
 * doc gives a range for `Volume` or `MakeUpGain`, so this is the manager's own.
 */
const GAIN_RANGE: KnobRange = { min: -96, max: 24, step: 0.5 };

/** The span of `Pitch` in cents, which `docs/design/wwise-audio.md` of `ltk_wwise` gives. */
const PITCH_RANGE: KnobRange = { min: -2400, max: 2400, step: 10 };

/** The span of `LPF` and `HPF`, which the property table of `ltk_wwise` gives. */
const FILTER_RANGE: KnobRange = { min: 0, max: 100, step: 1 };

/** The span of a playlist weight in Wwise's units. The manager's own, as no source gives one. */
const WEIGHT_RANGE: KnobRange = { min: 0, max: 100, step: 1 };

const KNOB_RANGES: Partial<Record<FieldName, KnobRange>> = {
  volume: GAIN_RANGE,
  makeUpGain: GAIN_RANGE,
  pitch: PITCH_RANGE,
  lpf: FILTER_RANGE,
  hpf: FILTER_RANGE,
  weight: WEIGHT_RANGE,
};

/** Returns the span that the knob of a `name` field turns over, or null for a field without one. */
export function knobRange(name: FieldName): KnobRange | null {
  return KNOB_RANGES[name] ?? null;
}
