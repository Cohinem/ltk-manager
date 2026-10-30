import { PlusIcon, WarningIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import { Knob, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { Audience, VoiceBank, VoiceRule, VoiceSituation } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { LINE_FIELD_CLASSES } from "../../bin/tree/components/AddLineFrame";
import {
  conditionText,
  hashLabel,
  lastSegment,
  ruleChance,
  textConditions,
} from "../utils/voiceConditions";
import { audienceSummary, situationWord, type VoiceLineRow } from "../utils/voiceLines";

/** The cells of a rule line that the arrows move between and Enter or F2 opens. */
export type LineCell = "name" | "chance" | "priority" | "short";

/** A rule line of the view. */
export type RuleRow = Extract<VoiceLineRow, { kind: "rule" }>;

/** Returns the cells that a rule line offers, in draw order. */
export function lineCells(row: VoiceLineRow): LineCell[] {
  if (row.kind !== "rule") return [];

  const cells: LineCell[] = [];
  if (row.rule.name !== null) cells.push("name");
  if (ruleChance(row.rule) !== null) cells.push("chance");
  cells.push("priority");
  if (row.rule.audio !== null) cells.push("short");
  return cells;
}

/** The widths of the columns of a rule line, so every line of the view aligns. */
const COLUMN = {
  name: "w-32",
  when: "w-64",
  chance: "w-20",
  priority: "w-12",
  audience: "w-24",
  short: "w-40",
} as const;

/** The classes of a number read out in a line. DS-MONO-SIZE. */
const NUMBER_CLASSES = "font-mono text-code tabular-nums text-surface-200";

/** The classes of the cell the arrows rest on. */
const ACTIVE_CELL = "rounded-sm ring-1 ring-accent-500/60";

const AUDIENCE_LABELS: Record<Audience, () => string> = {
  owner: m.audio_event_audience_owner_label,
  ally: m.audio_event_audience_ally_label,
  enemy: m.audio_event_audience_enemy_label,
  spectator: m.audio_event_audience_spectator_label,
};

/** Returns the label of `audience`. */
export function audienceLabel(audience: Audience): string {
  return AUDIENCE_LABELS[audience]();
}

/** The situation's word, its key name where the word differs, the rule count, its settings. */
export function SituationText({ situation }: { situation: VoiceSituation }) {
  const word = situationWord(situation.name);
  const cooldown = situation.cooldown ?? 0;

  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-medium text-surface-100">
        {word ?? hashLabel(situation.key)}
      </span>
      {situation.name !== null && word !== situation.name && (
        <span className="shrink-0 text-meta text-surface-400 select-text">{situation.name}</span>
      )}
      <span className="shrink-0 text-meta text-surface-400">
        {m.audio_voice_rules_label({ count: situation.rules.length })}
      </span>
      <span className="shrink-0 text-meta text-surface-300">
        {situation.chooseRandom ? m.audio_voice_random_label() : m.audio_voice_first_valid_label()}
      </span>
      {cooldown > 0 && (
        <span className="shrink-0 text-meta text-surface-400">
          {m.audio_voice_situation_cooldown_label({ seconds: String(cooldown) })}
        </span>
      )}
    </span>
  );
}

/** The edits a rule line sends, each resolving `true` if it landed. */
export interface RuleLineEdits {
  /** Sets the chance of the rule, and of each picked rule with this one. */
  readonly chance: (percent: number) => Promise<boolean>;
  readonly name: (name: string) => Promise<boolean>;
  /** Sets or, with null, clears the priority. */
  readonly priority: (priority: number | null) => Promise<boolean>;
  readonly short: (short: string) => Promise<boolean>;
}

interface RuleCellsProps {
  readonly row: RuleRow;
  /** The cell the arrows rest on, or null. */
  readonly active: LineCell | null;
  /** The cell whose entry is open, or null. */
  readonly entering: LineCell | null;
  readonly onEntering: (cell: LineCell | null) => void;
  /** The event banks of the chosen skin, which a warning names. */
  readonly banks: readonly VoiceBank[];
  /** The edits of the line, or null while the document takes none. */
  readonly edits: RuleLineEdits | null;
}

/**
 * The cells of one rule line: the rule name, the conditions in words, the chance knob, the
 * priority, the audiences, the short name and the event it resolves to.
 *
 * Each column has one width, so the lines of every situation align. A line that resolves no
 * event draws a warning that names the bank. Per "Voice lines" in docs/ux/CONTEXTUAL_VOICE.md.
 */
export function RuleCells({ row, active, entering, onEntering, banks, edits }: RuleCellsProps) {
  const { rule } = row;
  const close = () => onEntering(null);
  const cell = (name: LineCell, width: string, children: ReactNode) => (
    <span
      className={twMerge(
        "flex shrink-0 items-center gap-1.5 px-1",
        width,
        active === name && ACTIVE_CELL,
      )}
    >
      {children}
    </span>
  );

  return (
    <>
      {cell(
        "name",
        COLUMN.name,
        <NameCell
          rule={rule}
          index={row.index}
          entering={entering === "name"}
          edits={edits}
          onClose={close}
        />,
      )}
      <WhenCell rule={rule} />
      {cell(
        "chance",
        COLUMN.chance,
        <ChanceCell
          rule={rule}
          entering={entering === "chance"}
          edits={edits}
          onEntering={onEntering}
        />,
      )}
      {cell(
        "priority",
        COLUMN.priority,
        <PriorityCell
          rule={rule}
          entering={entering === "priority"}
          edits={edits}
          onClose={close}
        />,
      )}
      <span
        className={twMerge("shrink-0 truncate px-1 text-meta text-surface-300", COLUMN.audience)}
      >
        {audienceText(audienceSummary(rule.audio).audiences)}
      </span>
      {cell(
        "short",
        COLUMN.short,
        <ShortCell rule={rule} entering={entering === "short"} edits={edits} onClose={close} />,
      )}
      <EventCell rule={rule} banks={banks} />
    </>
  );
}

interface CellProps {
  readonly rule: VoiceRule;
  readonly entering: boolean;
  readonly edits: RuleLineEdits | null;
  readonly onClose: () => void;
}

function NameCell({ rule, index, entering, edits, onClose }: CellProps & { index: number }) {
  if (entering && rule.name !== null && edits !== null) {
    return (
      <LineEntry
        label={m.audio_voice_field_name_label()}
        initial={rule.name}
        onCommit={edits.name}
        onClose={onClose}
      />
    );
  }

  return (
    <span
      className={twMerge(
        "truncate font-medium",
        rule.name === null ? "text-surface-400" : "text-surface-100",
      )}
    >
      {rule.name ?? m.audio_voice_rule_unnamed_label({ index: String(index) })}
    </span>
  );
}

/** The conditions of a rule in words, but its chance, which the knob draws. */
function WhenCell({ rule }: { rule: VoiceRule }) {
  const when = textConditions(rule).map(conditionText);
  const relationship =
    rule.relationship !== 0 && when.length > 1 ? m.audio_voice_relationship_one_label() : null;
  const text = when.join(" · ");
  const body = (
    <span className={twMerge("shrink-0 truncate px-1 text-meta text-surface-300", COLUMN.when)}>
      {relationship !== null && <span className="text-surface-400">{relationship} </span>}
      {text}
    </span>
  );

  if (text === "") return body;
  return <Tooltip content={text}>{body}</Tooltip>;
}

function ChanceCell({
  rule,
  entering,
  edits,
  onEntering,
}: Omit<CellProps, "onClose"> & { onEntering: (cell: LineCell | null) => void }) {
  const chance = ruleChance(rule);
  const [draft, setDraft] = useState<{ value: number; over: number } | null>(null);
  if (draft !== null && chance !== null && draft.over !== chance.percent) setDraft(null);
  if (chance === null) return null;

  const shown = Math.round(draft?.value ?? chance.percent);
  return (
    <>
      <Knob
        value={draft?.value ?? chance.percent}
        min={0}
        max={100}
        step={1}
        defaultValue={0}
        unit={m.audio_edit_unit_percent()}
        format={(value) => String(Math.round(value))}
        entryOpen={edits !== null && entering}
        onEntryOpenChange={(open) => onEntering(open ? "chance" : null)}
        disabled={edits === null}
        className="size-4"
        aria-label={m.audio_voice_chance_knob_label()}
        onChange={(value) => setDraft({ value, over: chance.percent })}
        onCommit={(value) => {
          if (edits === null) return;
          return edits.chance(value).then((applied) => {
            if (!applied) setDraft(null);
            return applied;
          });
        }}
      />
      <span className={NUMBER_CLASSES}>
        {shown} {m.audio_edit_unit_percent()}
      </span>
    </>
  );
}

function PriorityCell({ rule, entering, edits, onClose }: CellProps) {
  if (entering && edits !== null) {
    return (
      <LineEntry
        label={m.audio_voice_field_priority_label()}
        initial={rule.priority === null ? "" : String(rule.priority)}
        numeric="integer"
        onCommit={(text) => edits.priority(text.trim() === "" ? null : Number(text))}
        onClose={onClose}
      />
    );
  }
  if (rule.priority === null) return null;

  return <span className={NUMBER_CLASSES}>{rule.priority}</span>;
}

function ShortCell({ rule, entering, edits, onClose }: CellProps) {
  const summary = audienceSummary(rule.audio);
  const line = summary.line;
  if (entering && edits !== null) {
    return (
      <LineEntry
        label={m.audio_voice_audience_label()}
        initial={line?.short ?? ""}
        onCommit={edits.short}
        onClose={onClose}
      />
    );
  }

  const others = new Set(rule.audio?.lines.map((each) => each.short).filter(Boolean)).size - 1;
  return (
    <>
      <span className="truncate text-surface-200 select-text">{line?.short ?? ""}</span>
      {summary.mixed && others > 0 && (
        <Tooltip content={m.audio_voice_mixed_names_hint()}>
          <span className="shrink-0 text-meta text-surface-400">
            {m.audio_voice_mixed_names_label({ count: String(others) })}
          </span>
        </Tooltip>
      )}
    </>
  );
}

/** The audiences of a line in words: `all` for the four, else each one. */
function audienceText(audiences: readonly Audience[]): string {
  if (audiences.length === 4) return m.audio_voice_audience_all_label();
  return audiences.map(audienceLabel).join(", ");
}

/** The event that the drawn line resolves to, a warning, or what a rule without audio does. */
function EventCell({ rule, banks }: { rule: VoiceRule; banks: readonly VoiceBank[] }) {
  const line = audienceSummary(rule.audio).line;

  if (line?.event != null) {
    return (
      <span className="min-w-0 truncate px-1 text-surface-300 select-text">{line.event.name}</span>
    );
  }
  if (line !== null) {
    const [bank] = banks;
    const text =
      bank === undefined
        ? m.audio_voice_no_bank_label()
        : m.audio_voice_no_event_label({ bank: lastSegment(bank.path) });
    return (
      <Tooltip content={m.audio_voice_no_event_hint()}>
        <span className="flex min-w-0 items-center gap-1 px-1 text-warning-text">
          <WarningIcon weight="fill" className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{text}</span>
        </span>
      </Tooltip>
    );
  }

  const muted = rule.animation ?? rule.trigger;
  if (muted === null) return null;

  const name = muted.name ?? hashLabel(muted.hash);
  const text =
    rule.animation !== null
      ? m.audio_voice_animation_label({ name })
      : m.audio_voice_chains_label({ name });
  return <span className="min-w-0 truncate px-1 text-meta text-surface-400">{text}</span>;
}

/** The add line under a situation's rules, which adds a rule on a press or Enter. */
export function AddRuleLine({ onAdd }: { onAdd: () => void }) {
  return (
    <span
      className="flex cursor-pointer items-center gap-1.5 px-1 text-surface-400 hover:text-surface-200"
      onClick={(event) => {
        event.stopPropagation();
        onAdd();
      }}
    >
      <PlusIcon weight="bold" className="size-3" aria-hidden />
      {m.audio_voice_add_rule_action()}
    </span>
  );
}

interface LineEntryProps {
  readonly label: string;
  readonly initial: string;
  /** A whole number or any number, which an empty text clears. Absent for text. */
  readonly numeric?: "integer" | "number";
  /** Takes the typed text. A promise that resolves `false` keeps the entry open, marked. */
  readonly onCommit: (text: string) => Promise<boolean>;
  readonly onClose: () => void;
  readonly className?: string;
}

/** A whole number, and any decimal number, as a numeric entry takes one. */
const INTEGER = /^-?\d+$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * The text entry of a cell, opened in place of its text, focused with the text selected.
 *
 * Enter and a press outside commit, and Escape closes it unchanged. A numeric entry refuses a text
 * that is not a whole number, and keeps it open marked.
 */
export function LineEntry({
  label,
  initial,
  numeric,
  onCommit,
  onClose,
  className,
}: LineEntryProps) {
  const [text, setText] = useState(initial);
  const [refused, setRefused] = useState(false);

  function commit() {
    if (text === initial) {
      onClose();
      return;
    }
    const pattern = numeric === "integer" ? INTEGER : NUMBER;
    if (numeric !== undefined && text.trim() !== "" && !pattern.test(text.trim())) {
      setRefused(true);
      return;
    }

    void onCommit(text).then((applied) => {
      if (applied) onClose();
      else setRefused(true);
    });
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <input
      autoFocus
      data-draft
      aria-label={label}
      aria-invalid={refused}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        setRefused(false);
      }}
      onKeyDown={keyDown}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      className={twMerge(
        LINE_FIELD_CLASSES,
        "w-full font-sans text-row",
        numeric !== undefined && "font-mono text-code tabular-nums",
        refused && "border-danger focus:border-danger",
        className,
      )}
    />
  );
}
