import type {
  Audience,
  AudienceLine,
  VoiceCondition,
  VoiceLines,
  VoiceRule,
  VoiceSituation,
} from "@/lib/tauri";

import { charactersOf, childrenOf, CLASS, FIELD, numberOf, spellOf } from "./voiceConditions";

/** What a trigger the reader simulates knows: the other unit's champion and the spell cast. */
export interface TriggerContext {
  /** The champion of the other unit, such as `Ezreal`, or null for any. */
  readonly target: string | null;
  /** The spell segment, such as `LuxLightBinding`, or null for any. */
  readonly spell: string | null;
  readonly audience: Audience;
}

/** Returns a number in [0, 1), as `Math.random` does. */
export type Random = () => number;

/** Returns `true` if `condition` passes for `context`. Unknown classes pass. */
function passes(condition: VoiceCondition, context: TriggerContext, random: Random): boolean {
  switch (condition.class) {
    case CLASS.chance:
      return random() * 100 < numberOf(condition, FIELD.percent);
    case CLASS.spellName:
      return context.spell === null || spellOf(condition) === context.spell;
    case CLASS.negation: {
      const [child] = childrenOf(condition, FIELD.child);
      return child === undefined || !passes(child, context, random);
    }
    case CLASS.character: {
      if (numberOf(condition, FIELD.characterType) !== OTHER_UNIT || context.target === null) {
        return true;
      }
      return childrenOf(condition, FIELD.children).every(
        (child) =>
          child.class !== CLASS.characterName ||
          charactersOf(child).some((name) => name.toLowerCase() === context.target?.toLowerCase()),
      );
    }
    default:
      return true;
  }
}

/** The `mCharacterType` of the other unit: the attack target, the victim, the enemy met. */
const OTHER_UNIT = 1;

/** Returns `true` if the conditions of `rule` pass for `context`, under its relationship. */
export function rulePasses(rule: VoiceRule, context: TriggerContext, random: Random): boolean {
  if (rule.relationship === 0) {
    return rule.conditions.every((condition) => passes(condition, context, random));
  }
  return rule.conditions.some((condition) => passes(condition, context, random));
}

/** Returns the line of `rule` for `audience`, or null if the rule names none for it. */
export function lineFor(rule: VoiceRule, audience: Audience): AudienceLine | null {
  const line = rule.audio?.lines.find((each) => each.audience === audience) ?? null;
  return line === null || line.short === "" ? null : line;
}

/**
 * Returns the rule that one trigger of `situation` plays for `context`, or null if no rule is
 * valid.
 *
 * A rule is valid when it names a line for the audience and its conditions pass, which rolls each
 * chance once. A situation that chooses at random draws among the valid rules by `ChanceWeight`,
 * and a weight of 0 is drawn only when every weight is 0. Otherwise the first valid rule in list
 * order plays. "Play situation" in docs/ux/CONTEXTUAL_VOICE.md.
 */
export function simulateTrigger(
  situation: VoiceSituation,
  context: TriggerContext,
  random: Random,
): VoiceRule | null {
  const valid = situation.rules.filter(
    (rule) => lineFor(rule, context.audience) !== null && rulePasses(rule, context, random),
  );
  if (!situation.chooseRandom) return valid[0] ?? null;

  const weighted = valid.filter((rule) => weightOf(rule) > 0);
  const pool = weighted.length > 0 ? weighted : valid;
  const weight = (rule: VoiceRule) => (weighted.length > 0 ? weightOf(rule) : 1);
  const total = pool.reduce((sum, rule) => sum + weight(rule), 0);

  let roll = random() * total;
  for (const rule of pool) {
    roll -= weight(rule);
    if (roll < 0) return rule;
  }
  return pool.at(-1) ?? null;
}

/** Returns the `ChanceWeight` of `rule`, `1` where the read wrote no number. */
function weightOf(rule: VoiceRule): number {
  return rule.chanceWeight ?? 1;
}

/** Returns the spells and the champions that the conditions of `lines` name, each once, sorted. */
export function triggerChoices(lines: VoiceLines): { spells: string[]; targets: string[] } {
  const spells = new Set<string>();
  const targets = new Set<string>();
  const visit = (condition: VoiceCondition) => {
    if (condition.class === CLASS.spellName) {
      const spell = spellOf(condition);
      if (spell !== null) spells.add(spell);
    }
    if (condition.class === CLASS.characterName) {
      for (const name of charactersOf(condition)) targets.add(name);
    }
    for (const field of condition.fields) {
      const nested =
        field.value.kind === "list"
          ? field.value.items
          : field.value.kind === "object"
            ? [field.value]
            : [];
      for (const item of nested) {
        if (item.kind === "object" && item.condition !== null) visit(item.condition);
      }
    }
  };

  for (const situation of lines.situations) {
    for (const rule of situation.rules) rule.conditions.forEach(visit);
  }
  return { spells: [...spells].sort(), targets: [...targets].sort() };
}
