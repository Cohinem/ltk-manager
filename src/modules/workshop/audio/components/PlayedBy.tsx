import { ArrowSquareOutIcon, ChatTextIcon } from "@phosphor-icons/react";

import { Button, HoverCard, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { AudioEvent, EventContext } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { CARD_TEXT } from "../../bin/classes/components/ClassCard";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useOpenVoiceLine } from "../hooks/useOpenSiteRow";
import { playedBy, type PlayingRule } from "../utils/playedBy";
import { situationWord } from "../utils/voiceLines";
import { audienceLabel } from "./VoiceLineRows";

/** The column of an event row that says what plays the event, at one x on every row. */
const CELL = "ml-auto w-40 shrink-0 truncate pl-3 text-meta";

/**
 * The Played by cell of an event row: the situation of the contextual rule that plays the event,
 * its chance when one rule plays it, `x2` and more when several do, or Listed only.
 *
 * A hover card lists every rule. Inside a project a press opens the rule's voice line, and with
 * several rules the press opens a menu of them. Per "Played by" in docs/ux/CONTEXTUAL_VOICE.md.
 */
export function PlayedByCell({ event }: { event: AudioEvent }) {
  const played = playedBy(event.contexts, event.listed !== null);
  const openRow = useOpenVoiceLine();
  const openLine = (rule: PlayingRule) => {
    const row = rule.contexts[0]?.row;
    if (row !== undefined) openRow(row);
  };
  const project = useOptionalProjectContext();

  if (played.kind !== "rules") {
    const listed = played.kind === "listed";
    const label = listed ? m.audio_played_by_listed_label() : m.audio_played_by_nothing_label();
    const hint = listed ? m.audio_played_by_listed_hint() : m.audio_played_by_nothing_hint();
    return (
      <Tooltip content={hint}>
        <span className={twMerge(CELL, "text-surface-400")}>{label}</span>
      </Tooltip>
    );
  }

  const text = playedText(played.word, played.count, played.chance);
  const [only] = played.rules;
  if (project === null || only === undefined) {
    return (
      <HoverCard
        label={text}
        className={twMerge("w-max max-w-sm min-w-64", CARD_TEXT)}
        content={<RulesCard rules={played.rules} />}
      >
        <span className={twMerge(CELL, "text-surface-300")}>{text}</span>
      </HoverCard>
    );
  }

  if (played.rules.length === 1) {
    return (
      <HoverCard
        label={text}
        className={twMerge("w-max max-w-sm min-w-64", CARD_TEXT)}
        content={<RulesCard rules={played.rules} />}
      >
        <span className={CELL}>
          <Button
            variant="ghost"
            size="xs"
            tabIndex={-1}
            className="h-5 max-w-full px-1 text-meta font-normal text-surface-200"
            onClick={(click) => {
              click.stopPropagation();
              openLine(only);
            }}
          >
            <span className="truncate">{text}</span>
          </Button>
        </span>
      </HoverCard>
    );
  }

  return (
    <span className={CELL}>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              variant="ghost"
              size="xs"
              tabIndex={-1}
              className="h-5 max-w-full px-1 text-meta font-normal text-surface-200"
              onClick={(click) => click.stopPropagation()}
            />
          }
        >
          <span className="truncate">{text}</span>
        </Menu.Trigger>
        <Menu.Content>
          {played.rules.map((rule) => (
            <Menu.Item
              key={`${rule.situationKey}:${rule.rule ?? rule.contexts[0]?.row.property?.path ?? ""}`}
              icon={<ArrowSquareOutIcon />}
              onClick={() => openLine(rule)}
            >
              {ruleLabel(rule)}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
    </span>
  );
}

/** Returns the text of the cell: the word, then the chance of one rule or the rule count. */
function playedText(word: string, count: number, chance: number | null): string {
  if (count > 1) return m.audio_played_by_rules_label({ word, count: String(count) });
  if (chance !== null) return m.audio_played_by_chance_label({ word, percent: String(chance) });
  return word;
}

/** Returns a rule as a menu and the card name it: the situation word and the rule name. */
function ruleLabel(rule: PlayingRule): string {
  return m.audio_played_by_rule_label({
    situation: situationWord(rule.situation) ?? rule.situation,
    rule: rule.rule ?? m.audio_event_context_unnamed_rule_label(),
  });
}

/** The hover card of the cell: every rule, its chance and the audiences it plays for. */
function RulesCard({ rules }: { rules: readonly PlayingRule[] }) {
  return (
    <div data-ui="PlayedBy:card" className="flex flex-col gap-2">
      <span className="font-medium text-surface-50">{m.audio_played_by_card_title()}</span>
      <ul className="flex flex-col gap-1">
        {rules.map((rule) => (
          <li key={`${rule.situationKey}:${rule.rule ?? ""}`} className="flex items-baseline gap-2">
            <ChatTextIcon aria-hidden className="size-3.5 shrink-0 self-center text-surface-400" />
            <span className="min-w-0 truncate text-surface-200">{ruleLabel(rule)}</span>
            {rule.chance !== null && (
              <span className="shrink-0 font-mono text-code text-surface-300 tabular-nums">
                {rule.chance} {m.audio_edit_unit_percent()}
              </span>
            )}
            <span className="shrink-0 text-meta text-surface-400">
              {audiencesOf(rule.contexts)}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-meta text-surface-400">{inferredHint(rules)}</span>
    </div>
  );
}

/** Returns the audiences that `contexts` play for, each once, in words. */
function audiencesOf(contexts: readonly EventContext[]): string {
  return [...new Set(contexts.map((context) => context.audience))].map(audienceLabel).join(", ");
}

/** Returns the hint under the rules: inferred, or ambiguous where two tags name two events. */
function inferredHint(rules: readonly PlayingRule[]): string {
  const ambiguous = rules.some((rule) => rule.contexts.some((context) => context.ambiguous));
  return ambiguous ? m.audio_event_context_ambiguous_hint() : m.audio_event_context_inferred_hint();
}
