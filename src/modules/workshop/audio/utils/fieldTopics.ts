import type { InspectorFact } from "./inspector";
import type { FieldName, NodeField } from "./nodeFields";

/**
 * A field or a container fact as the audio UI labels and documents it.
 *
 * A `delay` is `initialDelay` on a node and `actionDelay` on a Play action, which Wwise stores as
 * two properties.
 */
export type FieldTopic =
  | Exclude<FieldName, "delay">
  | "initialDelay"
  | "actionDelay"
  | InspectorFact["kind"];

/** A section of the inspector, which groups the fields of one object by what they change. */
export type FieldSection = "media" | "mix" | "filters" | "timing" | "selection";

/** Every topic in the order that the inspector lists them, with its section. */
const TOPICS: readonly (readonly [FieldTopic, FieldSection])[] = [
  ["target", "media"],
  ["source", "media"],
  ["volume", "mix"],
  ["makeUpGain", "mix"],
  ["pitch", "mix"],
  ["lpf", "filters"],
  ["hpf", "filters"],
  ["actionDelay", "timing"],
  ["initialDelay", "timing"],
  ["loopCount", "timing"],
  ["weight", "selection"],
  ["playlist", "selection"],
  ["pick", "selection"],
  ["switchGroup", "selection"],
  ["defaultSwitch", "selection"],
];

const TOPIC_SECTION: ReadonlyMap<FieldTopic, FieldSection> = new Map(TOPICS);

const TOPIC_ORDER: ReadonlyMap<FieldTopic, number> = new Map(
  TOPICS.map(([topic], index) => [topic, index]),
);

const SECTION_ORDER: readonly FieldSection[] = ["media", "mix", "filters", "timing", "selection"];

/** Returns the topic of `field`. */
export function fieldTopic(field: NodeField): FieldTopic {
  if (field.name !== "delay") return field.name;

  return field.owner === "action" ? "actionDelay" : "initialDelay";
}

/** One row of an inspector section: an editable field or a read-only fact. */
export type SectionEntry =
  | { readonly kind: "field"; readonly topic: FieldTopic; readonly field: NodeField }
  | { readonly kind: "fact"; readonly topic: FieldTopic; readonly fact: InspectorFact };

/** The rows of one section of an object in the inspector. */
export interface FieldGroup {
  readonly section: FieldSection;
  readonly entries: readonly SectionEntry[];
}

/**
 * Returns the fields and the facts of one object, grouped by section in inspector order.
 *
 * A section without a row is left out. Inside a section, the rows follow the order of `TOPICS`.
 */
export function fieldGroups(
  fields: readonly NodeField[],
  facts: readonly InspectorFact[],
): FieldGroup[] {
  const entries: SectionEntry[] = [
    ...fields.map((field) => ({ kind: "field" as const, topic: fieldTopic(field), field })),
    ...facts.map((fact) => ({ kind: "fact" as const, topic: fact.kind, fact })),
  ];
  const rank = (entry: SectionEntry) => TOPIC_ORDER.get(entry.topic) ?? TOPICS.length;
  entries.sort((left, right) => rank(left) - rank(right));

  return SECTION_ORDER.flatMap((section) => {
    const held = entries.filter((entry) => TOPIC_SECTION.get(entry.topic) === section);
    return held.length === 0 ? [] : [{ section, entries: held }];
  });
}
