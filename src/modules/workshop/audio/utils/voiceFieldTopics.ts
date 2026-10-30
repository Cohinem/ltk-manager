import { m } from "@/i18n";
import type { LeafValue, ValueEdit, VoiceRule, VoiceSituation } from "@/lib/tauri";

import { fieldEdits, fieldPath, priorityEdits } from "./voiceEdits";

/**
 * A field of a rule or a situation as the Voice lines inspector labels it, edits it and documents
 * it through the field card of its class. Per "Inspector" in docs/ux/CONTEXTUAL_VOICE.md.
 */
export type VoiceFieldTopic =
  | "name"
  | "relationship"
  | "priority"
  | "stompLower"
  | "canStompSelf"
  | "activeVoiceOver"
  | "chanceWeight"
  | "overrideCooldown"
  | "ignoreTimer"
  | "dontResetTimer"
  | "maxPlays"
  | "waitForAnnouncer"
  | "waitTimeout"
  | "chooseRandom"
  | "situationCooldown";

/** A section of the inspector, which groups the fields by what they change. */
export type VoiceFieldSection = "rule" | "cooldown" | "plays" | "situation";

/** How a topic's value is entered. */
export type VoiceFieldKind = "bool" | "integer" | "number" | "text" | "relationship" | "priority";

/** What the inspector knows about one topic. */
export interface VoiceTopic {
  readonly section: VoiceFieldSection;
  /** The meta class of the struct that holds the field, which the field card documents. */
  readonly holder: string;
  /** The bin field. */
  readonly field: string;
  readonly kind: VoiceFieldKind;
  readonly label: () => string;
}

const AUDIO_CLASS = "ContextualActionPlayVO";
const COOLDOWN_CLASS = "ContextualActionCooldownModifications";

/** Every topic, in the order that the inspector lists them. */
export const VOICE_TOPICS: Readonly<Record<VoiceFieldTopic, VoiceTopic>> = {
  name: {
    section: "rule",
    holder: "ContextualRule",
    field: "mRuleName",
    kind: "text",
    label: m.audio_voice_field_name_label,
  },
  relationship: {
    section: "rule",
    holder: "ContextualRule",
    field: "mConditionRelationship",
    kind: "relationship",
    label: m.audio_voice_field_relationship_label,
  },
  priority: {
    section: "rule",
    holder: "ContextualRule",
    field: "mPriority",
    kind: "priority",
    label: m.audio_voice_field_priority_label,
  },
  stompLower: {
    section: "rule",
    holder: "ContextualRule",
    field: "StompLowerPriority",
    kind: "bool",
    label: m.audio_voice_field_stomp_lower_label,
  },
  canStompSelf: {
    section: "rule",
    holder: "ContextualRule",
    field: "CanStompSelf",
    kind: "bool",
    label: m.audio_voice_field_can_stomp_self_label,
  },
  activeVoiceOver: {
    section: "rule",
    holder: "ContextualRule",
    field: "ActiveVoiceOver",
    kind: "bool",
    label: m.audio_voice_field_active_voice_over_label,
  },
  chanceWeight: {
    section: "rule",
    holder: "ContextualRule",
    field: "ChanceWeight",
    kind: "number",
    label: m.audio_voice_field_chance_weight_label,
  },
  overrideCooldown: {
    section: "cooldown",
    holder: "ContextualRule",
    field: "mOverrideCacCooldown",
    kind: "bool",
    label: m.audio_voice_field_override_cooldown_label,
  },
  ignoreTimer: {
    section: "cooldown",
    holder: COOLDOWN_CLASS,
    field: "IgnoreTimer",
    kind: "bool",
    label: m.audio_voice_field_ignore_timer_label,
  },
  dontResetTimer: {
    section: "cooldown",
    holder: COOLDOWN_CLASS,
    field: "DontResetTimer",
    kind: "bool",
    label: m.audio_voice_field_dont_reset_timer_label,
  },
  maxPlays: {
    section: "plays",
    holder: AUDIO_CLASS,
    field: "mMaxOccurences",
    kind: "integer",
    label: m.audio_voice_field_max_plays_label,
  },
  waitForAnnouncer: {
    section: "plays",
    holder: AUDIO_CLASS,
    field: "mWaitForAnnouncerQueue",
    kind: "bool",
    label: m.audio_voice_field_wait_for_announcer_label,
  },
  waitTimeout: {
    section: "plays",
    holder: AUDIO_CLASS,
    field: "mWaitTimeout",
    kind: "number",
    label: m.audio_voice_field_wait_timeout_label,
  },
  chooseRandom: {
    section: "situation",
    holder: "ContextualSituation",
    field: "mChooseRandomValidRule",
    kind: "bool",
    label: m.audio_voice_field_choose_random_label,
  },
  situationCooldown: {
    section: "situation",
    holder: "ContextualSituation",
    field: "mCoolDownTime",
    kind: "number",
    label: m.audio_voice_field_situation_cooldown_label,
  },
};

/** The topics of a rule, by section in inspector order. A rule without audio has no Plays. */
export function ruleTopics(rule: VoiceRule): VoiceFieldTopic[] {
  const topics: VoiceFieldTopic[] = [
    "relationship",
    "priority",
    "stompLower",
    "canStompSelf",
    "activeVoiceOver",
    "chanceWeight",
    "overrideCooldown",
    "ignoreTimer",
    "dontResetTimer",
  ];
  if (rule.name !== null) topics.unshift("name");
  if (rule.audio !== null) topics.push("maxPlays", "waitForAnnouncer", "waitTimeout");
  return topics;
}

/** The topics of a situation. */
export const SITUATION_TOPICS: readonly VoiceFieldTopic[] = ["chooseRandom", "situationCooldown"];

/** A topic's value as the inspector draws it. */
export type TopicValue = boolean | number | string | null;

/** Returns the value of `topic` on `rule`. */
export function ruleValue(rule: VoiceRule, topic: VoiceFieldTopic): TopicValue {
  switch (topic) {
    case "name":
      return rule.name;
    case "relationship":
      return rule.relationship;
    case "priority":
      return rule.priority;
    case "stompLower":
      return rule.stompLower;
    case "canStompSelf":
      return rule.canStompSelf;
    case "activeVoiceOver":
      return rule.activeVoiceOver;
    case "chanceWeight":
      return rule.chanceWeight ?? 1;
    case "overrideCooldown":
      return rule.overrideCooldown;
    case "ignoreTimer":
      return rule.cooldownModifications?.ignoreTimer ?? false;
    case "dontResetTimer":
      return rule.cooldownModifications?.dontResetTimer ?? false;
    case "maxPlays":
      return rule.audio?.maxOccurrences ?? 0;
    case "waitForAnnouncer":
      return rule.audio?.waitForAnnouncer ?? false;
    case "waitTimeout":
      return rule.audio?.waitTimeout ?? 0;
    case "chooseRandom":
    case "situationCooldown":
      return null;
  }
}

/** Returns the value of `topic` on `situation`. */
export function situationValue(situation: VoiceSituation, topic: VoiceFieldTopic): TopicValue {
  if (topic === "chooseRandom") return situation.chooseRandom;
  if (topic === "situationCooldown") return situation.cooldown ?? 0;
  return null;
}

/** Returns `value` as the leaf an edit of a field of `kind` writes. */
function leafOf(kind: VoiceFieldKind, value: TopicValue): LeafValue {
  if (kind === "bool") return { type: "bool", value: value === true };
  if (kind === "text") return { type: "string", value: String(value ?? "") };
  if (kind === "number") return { type: "float", value: Number(value) };
  return { type: "integer", text: String(Math.round(Number(value))) };
}

/**
 * Returns the edits that set `topic` of the struct at `path`, a rule or a situation, to `value`.
 *
 * A field of the audio action or of the cooldown modifications gives its null pointer a class
 * first, and a field the struct does not write is added at its default first, so the edits land
 * as one step. A null priority clears the option.
 */
export function topicEdits(path: string, topic: VoiceFieldTopic, value: TopicValue): ValueEdit[] {
  const { holder, field, kind } = VOICE_TOPICS[topic];
  if (kind === "priority") return priorityEdits(path, typeof value === "number" ? value : null);

  if (holder === AUDIO_CLASS || holder === COOLDOWN_CLASS) {
    const pointer = fieldPath(
      path,
      holder === AUDIO_CLASS ? "mAudioAction" : "CooldownModifications",
    );
    return [
      { type: "ensurePointer", path: pointer, class: holder },
      ...fieldEdits(pointer, field, leafOf(kind, value)),
    ];
  }

  /* `mRuleName` is not in the meta class, so it is set where the rule writes it, never added. */
  if (topic === "name") {
    return [{ type: "setLeaf", path: fieldPath(path, field), value: leafOf(kind, value) }];
  }

  return fieldEdits(path, field, leafOf(kind === "relationship" ? "integer" : kind, value));
}
