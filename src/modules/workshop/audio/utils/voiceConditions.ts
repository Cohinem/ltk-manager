import { m } from "@/i18n";
import type { HashText, VoiceCondition, VoiceConditionValue, VoiceRule } from "@/lib/tauri";

import { fnv1a32 } from "../../bin/shared/utils/binHash";

/** The class hashes that the view reads by name. */
export const CLASS = {
  chance: fnv1a32("ContextualConditionChanceToPlay"),
  spellName: fnv1a32("ContextualConditionSpellName"),
  spellSlot: fnv1a32("ContextualConditionSpellSlot"),
  spellLevel: fnv1a32("ContextualConditionSpellLevel"),
  spell: fnv1a32("ContextualConditionSpell"),
  ruleCooldown: fnv1a32("ContextualConditionRuleCooldown"),
  moveDistance: fnv1a32("ContextualConditionMoveDistance"),
  character: fnv1a32("ContextualConditionCharacter"),
  anyOtherHero: fnv1a32("ContextualConditionAnyOtherHero"),
  negation: fnv1a32("ContextualConditionNegation"),
  characterName: fnv1a32("ContextualConditionCharacterName"),
  characterMetadata: fnv1a32("ContextualConditionCharacterMetadata"),
  encounterNumber: fnv1a32("ContextualConditionEnemyEncounterNumber"),
  isAlly: fnv1a32("ContextualConditionIsAlly"),
  health: fnv1a32("ContextualConditionCharacterHealth"),
  multikill: fnv1a32("ContextualConditionMultikillSize"),
  itemId: fnv1a32("ContextualConditionItemID"),
  markerName: fnv1a32("ContextualConditionMarkerName"),
} as const;

/** The field hashes that the view reads by name. */
export const FIELD = {
  percent: fnv1a32("mPercentChanceToPlay"),
  spell: fnv1a32("mSpell"),
  spellSlot: fnv1a32("mSpellSlot"),
  spellLevel: fnv1a32("mSpellLevel"),
  compareOp: fnv1a32("mCompareOp"),
  compareOpBare: fnv1a32("CompareOp"),
  ruleCooldown: fnv1a32("mRuleCooldown"),
  distance: fnv1a32("mDistance"),
  characterType: fnv1a32("mCharacterType"),
  children: fnv1a32("mChildConditions"),
  child: fnv1a32("mChildCondition"),
  characters: fnv1a32("mCharacters"),
  category: fnv1a32("mCategory"),
  data: fnv1a32("mData"),
  encounter: fnv1a32("EncounterNumber"),
  isAlly: fnv1a32("mIsAlly"),
  health: fnv1a32("mTargetHealth"),
  multikill: fnv1a32("mMultikillSize"),
  items: fnv1a32("mItems"),
  markers: fnv1a32("mMarkerNames"),
} as const;

/** The operators of every `CompareOp` and `mCompareOp`, by value. */
const OPERATORS = ["=", "≠", ">", "≥", "<", "≤"] as const;

/** The text of a value that a condition does not write. */
const UNKNOWN = "";

/** The spell slot letters of `mSpellSlot`, by value. */
const SLOTS = ["Q", "W", "E", "R"] as const;

/** The units of `mCharacterType`, by value. */
const UNITS: readonly (() => string)[] = [
  m.audio_voice_unit_self_label,
  m.audio_voice_unit_other_label,
  m.audio_voice_unit_nearby_a_label,
  m.audio_voice_unit_nearby_b_label,
  m.audio_voice_unit_killer_label,
  m.audio_voice_unit_owner_killer_label,
  m.audio_voice_unit_victim_label,
  m.audio_voice_unit_nearby_source_label,
  m.audio_voice_unit_global_hero_label,
  m.audio_voice_unit_counterpart_label,
];

/** The label of the unit `value` of `mCharacterType`, or the number for a value outside it. */
export function unitLabel(value: number): string {
  return UNITS[value]?.() ?? String(value);
}

/** The label of the operator `value` of a `CompareOp`, or the number for a value outside it. */
export function operatorLabel(value: number): string {
  return OPERATORS[value] ?? String(value);
}

/** Returns the value of the field `field` of `condition`, if it writes the field. */
export function conditionField(
  condition: VoiceCondition,
  field: number,
): VoiceConditionValue | undefined {
  return condition.fields.find((each) => each.field === field)?.value;
}

export function numberOf(condition: VoiceCondition, field: number, fallback = 0): number {
  const value = conditionField(condition, field);
  if (value?.kind === "integer" || value?.kind === "float") return value.value ?? fallback;
  return fallback;
}

function hashOf(condition: VoiceCondition, field: number): HashText | null {
  const value = conditionField(condition, field);
  return value?.kind === "hash" ? value.hash : null;
}

function textOf(condition: VoiceCondition, field: number): string {
  const value = conditionField(condition, field);
  return value?.kind === "text" ? value.value : "";
}

export function childrenOf(condition: VoiceCondition, field: number): VoiceCondition[] {
  const value = conditionField(condition, field);
  if (value?.kind === "object") return value.condition === null ? [] : [value.condition];
  if (value?.kind !== "list") return [];

  return value.items.flatMap((item) =>
    item.kind === "object" && item.condition !== null ? [item.condition] : [],
  );
}

/** Returns the last segment of a path, such as the spell of a spell object path. */
export function lastSegment(path: string): string {
  return path.split("/").at(-1) ?? path;
}

/** Returns the champion that a character record path names, such as `Ezreal`. */
function characterOf(hash: HashText): string {
  if (hash.name === null) return hashLabel(hash.hash);

  const [root, champion] = hash.name.split("/");
  return root?.toLowerCase() === "characters" && champion !== undefined ? champion : hash.name;
}

/** A hash as the view writes one without a name: `0x` and eight hex digits. */
export function hashLabel(hash: number): string {
  return `0x${hash.toString(16).padStart(8, "0")}`;
}

/** Returns the spell segment of the spell condition `condition`, or null without a spell. */
export function spellOf(condition: VoiceCondition): string | null {
  const spell = hashOf(condition, FIELD.spell);
  if (spell === null) return null;

  return spell.name === null ? hashLabel(spell.hash) : lastSegment(spell.name);
}

/** Returns the champions that a character name condition lists. */
export function charactersOf(condition: VoiceCondition): string[] {
  const value = conditionField(condition, FIELD.characters);
  if (value?.kind !== "list") return [];

  return value.items.flatMap((item) => (item.kind === "hash" ? [characterOf(item.hash)] : []));
}

/** Returns a value as the fallback text writes it. */
function valueText(value: VoiceConditionValue): string {
  switch (value.kind) {
    case "bool":
      return String(value.value);
    case "integer":
    case "float":
      return String(value.value);
    case "text":
      return value.value;
    case "hash":
      return value.hash.name === null ? hashLabel(value.hash.hash) : lastSegment(value.hash.name);
    case "list":
      return value.items.map(valueText).join(", ");
    case "object":
      return value.condition === null ? "null" : conditionText(value.condition);
    case "other":
      return value.shape;
  }
}

/** The class name of `condition` without the `ContextualCondition` prefix, or its hash. */
export function conditionClassLabel(condition: VoiceCondition): string {
  if (condition.className === null) return hashLabel(condition.class);

  return condition.className.replace(/^ContextualCondition/, "") || condition.className;
}

/**
 * Returns `condition` as one readable phrase, such as `spell LuxLightBinding` or
 * `other is Ezreal`.
 *
 * A class the view does not know reads as its short class name and its fields.
 */
export function conditionText(condition: VoiceCondition): string {
  switch (condition.class) {
    case CLASS.chance:
      return m.audio_voice_condition_chance_label({
        percent: String(numberOf(condition, FIELD.percent)),
      });
    case CLASS.spellName:
      return m.audio_voice_condition_spell_label({ spell: spellOf(condition) ?? UNKNOWN });
    case CLASS.spellSlot:
      return m.audio_voice_condition_slot_label({
        slot: SLOTS[numberOf(condition, FIELD.spellSlot)] ?? UNKNOWN,
      });
    case CLASS.spellLevel:
      return m.audio_voice_condition_spell_level_label({
        operator: operatorLabel(numberOf(condition, FIELD.compareOp)),
        level: String(numberOf(condition, FIELD.spellLevel)),
      });
    case CLASS.ruleCooldown:
      return m.audio_voice_condition_rule_cooldown_label({
        seconds: String(numberOf(condition, FIELD.ruleCooldown)),
      });
    case CLASS.moveDistance:
      return m.audio_voice_condition_move_label({
        operator: operatorLabel(numberOf(condition, FIELD.compareOp)),
        distance: String(numberOf(condition, FIELD.distance)),
      });
    case CLASS.multikill:
      return m.audio_voice_condition_multikill_label({
        size: String(numberOf(condition, FIELD.multikill)),
      });
    case CLASS.negation: {
      const [child] = childrenOf(condition, FIELD.child);
      return m.audio_voice_condition_not_label({
        condition: child === undefined ? UNKNOWN : conditionText(child),
      });
    }
    case CLASS.character:
      return m.audio_voice_condition_unit_label({
        unit: unitLabel(numberOf(condition, FIELD.characterType)),
        tests: childrenOf(condition, FIELD.children).map(subconditionText).join(", "),
      });
    case CLASS.anyOtherHero:
      return m.audio_voice_condition_any_hero_label({
        tests: childrenOf(condition, FIELD.children).map(subconditionText).join(", "),
      });
    case CLASS.spell:
      return m.audio_voice_condition_slot_label({
        slot: `${SLOTS[numberOf(condition, FIELD.spellSlot)] ?? UNKNOWN}: ${childrenOf(
          condition,
          FIELD.children,
        )
          .map(conditionText)
          .join(", ")}`,
      });
    case CLASS.itemId:
      return m.audio_voice_condition_item_label({
        items: valueText(conditionField(condition, FIELD.items) ?? { kind: "list", items: [] }),
      });
    case CLASS.markerName:
      return m.audio_voice_condition_marker_label({
        markers: valueText(conditionField(condition, FIELD.markers) ?? { kind: "list", items: [] }),
      });
    default:
      return genericText(condition);
  }
}

/** Returns a test on one unit, the child of a character condition, as one phrase. */
function subconditionText(condition: VoiceCondition): string {
  switch (condition.class) {
    case CLASS.characterName:
      return m.audio_voice_condition_is_label({ names: charactersOf(condition).join(" / ") });
    case CLASS.characterMetadata:
      return `${textOf(condition, FIELD.category)} ${textOf(condition, FIELD.data)}`.trim();
    case CLASS.encounterNumber: {
      const operator = numberOf(condition, FIELD.compareOpBare);
      const number = numberOf(condition, FIELD.encounter, 1);
      if (operator === 0 && number === 1) return m.audio_voice_condition_first_label();
      return m.audio_voice_condition_encounter_label({
        operator: operatorLabel(operator),
        number: String(number),
      });
    }
    case CLASS.isAlly: {
      const value = conditionField(condition, FIELD.isAlly);
      return value?.kind === "bool" && value.value
        ? m.audio_voice_condition_ally_label()
        : m.audio_voice_condition_enemy_label();
    }
    case CLASS.health:
      return m.audio_voice_condition_health_label({
        operator: operatorLabel(numberOf(condition, FIELD.compareOp)),
        percent: String(numberOf(condition, FIELD.health)),
      });
    default:
      return conditionText(condition);
  }
}

function genericText(condition: VoiceCondition): string {
  const fields = condition.fields
    .map((field) => `${field.name ?? hashLabel(field.field)} = ${valueText(field.value)}`)
    .join(", ");
  return `${conditionClassLabel(condition)}(${fields})`;
}

/** The chance knob of a rule: the path of its one top-level chance condition, and the percent. */
export interface RuleChance {
  /** The hash path of the condition. */
  readonly path: string;
  readonly percent: number;
}

/** Returns the chance of `rule`, or null if it has no chance condition or several. */
export function ruleChance(rule: VoiceRule): RuleChance | null {
  const chances = rule.conditions.filter((condition) => condition.class === CLASS.chance);
  const [only] = chances;
  if (only === undefined || chances.length > 1) return null;

  return { path: only.path, percent: numberOf(only, FIELD.percent) };
}

/** Returns the conditions of `rule` that the row writes as text: all but its chance knob's. */
export function textConditions(rule: VoiceRule): VoiceCondition[] {
  const chance = ruleChance(rule);
  return rule.conditions.filter((condition) => condition.path !== chance?.path);
}
