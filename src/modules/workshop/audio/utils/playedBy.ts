import type { EventContext } from "@/lib/tauri";

import { situationWord } from "./voiceLines";

/** One rule that plays a bank event, collapsed over its audiences and over copies of the rule. */
export interface PlayingRule {
  readonly situation: string;
  readonly situationKey: number;
  readonly rule: string | null;
  readonly chance: number | null;
  /** Every context of the rule, the first one's row opening the view. */
  readonly contexts: readonly EventContext[];
}

/**
 * Returns the distinct rules of `contexts`.
 *
 * A context is one object, rule and audience. Two contexts are one rule when they share the
 * situation key and the rule name, which collapses the four audiences of one rule and the copies
 * of a rule in the objects of other skins. A rule without a name is told apart by its row.
 */
export function playingRules(contexts: readonly EventContext[]): PlayingRule[] {
  const rules = new Map<string, EventContext[]>();
  for (const context of contexts) {
    const identity =
      context.rule === null
        ? `${context.row.objectHash}:${context.row.property?.path ?? ""}`
        : context.rule;
    const key = `${context.situationKey}:${identity}`;
    rules.set(key, [...(rules.get(key) ?? []), context]);
  }

  return [...rules.values()].flatMap((group) => {
    const [first] = group;
    if (first === undefined) return [];

    return [
      {
        situation: first.situation,
        situationKey: first.situationKey,
        rule: first.rule,
        chance: first.chance,
        contexts: group,
      },
    ];
  });
}

/** What the Played by cell of a bank event says. */
export type PlayedBy =
  | {
      readonly kind: "rules";
      /** The situation word of the first rule. */
      readonly word: string;
      /** The number of distinct rules. */
      readonly count: number;
      /** The chance of the one rule, or null. */
      readonly chance: number | null;
      readonly rules: readonly PlayingRule[];
    }
  | { readonly kind: "listed" }
  | { readonly kind: "nothing" };

/** Returns what plays an event: its contextual rules, else the bank unit that lists it, else nothing. */
export function playedBy(contexts: readonly EventContext[], listed: boolean): PlayedBy {
  const rules = playingRules(contexts);
  const [first] = rules;
  if (first === undefined) return listed ? { kind: "listed" } : { kind: "nothing" };

  return {
    kind: "rules",
    word: situationWord(first.situation) ?? first.situation,
    count: rules.length,
    chance: rules.length === 1 ? first.chance : null,
    rules,
  };
}
