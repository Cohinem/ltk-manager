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
import { fileName } from "./bankUnits";

/** The name of a field row: an ID that the object points at, a property, or a playlist weight. */
export type FieldName = "target" | "source" | NodeProperty | "weight";

/** What an edit of a field changes, which `fieldEdit` turns into a `BankEdit`. */
export type FieldTarget =
  | { readonly kind: "target"; readonly action: number }
  | { readonly kind: "source"; readonly sound: number }
  | { readonly kind: "property"; readonly object: number; readonly property: NodeProperty }
  | { readonly kind: "weight"; readonly container: number; readonly child: number };

/** What the row resolves a field's value to, beyond the number. */
export type FieldDetail =
  | { readonly kind: "none" }
  /** The node that a Play target names, or null if the tree does not hold it. */
  | { readonly kind: "object"; readonly node: EventNode | null }
  /** The game path of the file that holds a source's media, or null if no file holds it. */
  | { readonly kind: "media"; readonly path: string | null }
  /** The weight's fraction of the playlist's total, or null if the pick reads no weights. */
  | { readonly kind: "weight"; readonly share: number | null };

/** One field of an action or a node, as a child row draws it. */
export interface NodeField {
  readonly name: FieldName;
  /** The kind of object that holds the field, which tells a Play action's delay from a node's. */
  readonly owner: FieldOwner["kind"];
  /** The value in the unit that the row shows: seconds for a delay, Wwise's weight. */
  readonly value: number;
  /** `true` if the object is in the opened bank at version 145, which an edit changes. */
  readonly editable: boolean;
  readonly target: FieldTarget;
  readonly detail: FieldDetail;
}

/** The object whose fields a row lists: an action, or a node of the event tree. */
export type FieldOwner =
  | { readonly kind: "action"; readonly action: EventAction }
  | { readonly kind: "node"; readonly node: EventNode };

const MS_PER_SECOND = 1000;

const NO_DETAIL: FieldDetail = { kind: "none" };

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
      owner: "node",
      value: node.source,
      editable,
      target: { kind: "source", sound: node.id },
      detail: { kind: "media", path: node.media?.path ?? null },
    });
  }

  for (const { property, value } of own?.values ?? []) {
    fields.push(propertyField({ kind: "node", id: node.id }, property, value, editable));
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
      owner: "action",
      value: action.target,
      editable,
      target: { kind: "target", action: action.id },
      detail: { kind: "object", node: action.node },
    });
  }

  const delay = own?.values.find((value) => value.property === "delay");
  fields.push(
    propertyField(
      { kind: "action", id: action.id },
      "delay",
      delay?.value ?? action.delay / MS_PER_SECOND,
      editable,
    ),
  );

  return fields;
}

function propertyField(
  object: { readonly kind: FieldOwner["kind"]; readonly id: number },
  property: NodeProperty,
  value: number | null,
  editable: boolean,
): NodeField {
  return {
    name: property,
    owner: object.kind,
    value: value ?? PROPERTY_DEFAULTS[property],
    editable,
    target: { kind: "property", object: object.id, property },
    detail: NO_DETAIL,
  };
}

/** Returns the playlist weight of `child` in `container`, or null if its playlist omits it. */
function weightField(
  child: number,
  container: EventNode,
  properties: ReadonlyMap<number, ObjectProperties>,
): NodeField | null {
  const held = properties.get(container.id);
  const weights = held?.weights;
  const item = weights?.items.find((each) => each.child === child);
  if (held === undefined || weights === undefined || weights === null || item === undefined) {
    return null;
  }

  const picks = container.kind === "random" && container.mode === "random" && weights.weighted;
  const total = weights.items.reduce((sum, each) => sum + each.weight, 0);

  return {
    name: "weight",
    owner: "node",
    value: Number(weightText(item.weight)),
    editable: held.editable,
    target: { kind: "weight", container: container.id, child },
    detail: { kind: "weight", share: picks && total > 0 ? item.weight / total : null },
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

/** The weight that Wwise gives a new playlist item, in the unit that the row shows. */
const DEFAULT_WEIGHT = 50;

/**
 * Returns the edit that sets `field` to its default: the property's default, or a weight of 50.
 *
 * Returns null for a target or a source, which has no default, and for a field that takes no edit.
 */
export function resetEdit(field: NodeField): BankEdit | null {
  if (!field.editable) return null;

  const { target } = field;
  if (target.kind === "property") return fieldEdit(field, PROPERTY_DEFAULTS[target.property]);
  if (target.kind === "weight") return fieldEdit(field, DEFAULT_WEIGHT);

  return null;
}

/** A unit that a typed value may end in, and what the number is divided by to reach the field's. */
interface TypedUnit {
  readonly suffix: string;
  readonly divisor: number;
}

const GAIN_UNITS: readonly TypedUnit[] = [{ suffix: "db", divisor: 1 }];

const PITCH_UNITS: readonly TypedUnit[] = [
  { suffix: "cents", divisor: 1 },
  { suffix: "cent", divisor: 1 },
  { suffix: "ct", divisor: 1 },
];

const FILTER_UNITS: readonly TypedUnit[] = [{ suffix: "%", divisor: 1 }];

/** `ms` comes before `s`, which it ends in. */
const DELAY_UNITS: readonly TypedUnit[] = [
  { suffix: "ms", divisor: MS_PER_SECOND },
  { suffix: "s", divisor: 1 },
];

const TYPED_UNITS: Readonly<Record<NodeProperty, readonly TypedUnit[]>> = {
  volume: GAIN_UNITS,
  makeUpGain: GAIN_UNITS,
  pitch: PITCH_UNITS,
  lpf: FILTER_UNITS,
  hpf: FILTER_UNITS,
  delay: DELAY_UNITS,
  loopCount: [],
};

/**
 * Returns the value that `text` holds for `field`, or null if the text holds none.
 *
 * A property value may end in its unit, in any case: `dB`, `cents`, `%`, or `s` and `ms` for a
 * delay. An empty property text holds the property's default.
 */
export function parseField(field: NodeField, text: string): number | null {
  const { target } = field;
  switch (target.kind) {
    case "target":
    case "source":
      return parseId(text);
    case "property":
      return parsePropertyText(text, target.property);
    case "weight": {
      const stored = parseWeight(text);
      return stored === null ? null : Number(weightText(stored));
    }
  }
}

function parsePropertyText(text: string, property: NodeProperty): number | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const unit = TYPED_UNITS[property].find(({ suffix }) => lower.endsWith(suffix));
  if (unit === undefined) return parseValue(trimmed, property);

  const value = parseValue(trimmed.slice(0, trimmed.length - unit.suffix.length), property);
  return value === null ? null : value / unit.divisor;
}

/** The unit that a field row writes after its number. */
export type FieldUnit = "dB" | "cents" | "%" | "s";

/** What the row of a field shows at rest. */
export type FieldDisplay =
  | { readonly kind: "quantity"; readonly number: string; readonly unit: FieldUnit | null }
  /** The plays of a sound. 0 loops forever. */
  | { readonly kind: "loop"; readonly plays: number }
  | { readonly kind: "object"; readonly id: number; readonly node: EventNode | null }
  /** The file name of the media of a source, or null if no file holds it. */
  | { readonly kind: "media"; readonly id: number; readonly name: string | null }
  /** A playlist weight and its fraction of the total, or null if the pick reads no weights. */
  | { readonly kind: "weight"; readonly number: string; readonly share: number | null };

/** Returns `value` with `decimals` decimals and a `+` before a positive one. */
function signed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  if (Number(text) === 0) return (0).toFixed(decimals);

  return value > 0 ? `+${text}` : text;
}

/**
 * Returns what the row of `field` shows at rest: the number in its authoring unit, or the name
 * that an ID resolves to.
 *
 * A gain shows one decimal and a pitch whole cents, both signed. A filter and a delay show their
 * number with at most three decimals.
 */
export function fieldDisplay(field: NodeField): FieldDisplay {
  const { detail } = field;
  if (detail.kind === "object") return { kind: "object", id: field.value, node: detail.node };
  if (detail.kind === "media") {
    const name = detail.path === null ? null : fileName(detail.path);
    return { kind: "media", id: field.value, name };
  }
  if (detail.kind === "weight") {
    return { kind: "weight", number: formatValue(field.value), share: detail.share };
  }

  switch (field.name) {
    case "volume":
    case "makeUpGain":
      return { kind: "quantity", number: signed(field.value, 1), unit: "dB" };
    case "pitch":
      return { kind: "quantity", number: signed(field.value, 0), unit: "cents" };
    case "lpf":
    case "hpf":
      return { kind: "quantity", number: formatValue(field.value), unit: "%" };
    case "delay":
      return { kind: "quantity", number: formatValue(field.value), unit: "s" };
    case "loopCount":
      return { kind: "loop", plays: field.value };
    default:
      return { kind: "quantity", number: formatValue(field.value), unit: null };
  }
}

/** Returns the text that the value entry of `field` opens with: the value without rounding. */
export function fieldEntryText(field: NodeField): string {
  if (field.name === "target" || field.name === "source") return String(field.value);

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
