import { PlusIcon, WarningIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { Badge, Knob, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { Audience, VoiceBank, VoiceRule, VoiceSituation } from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  conditionText,
  hashLabel,
  lastSegment,
  ruleChance,
  textConditions,
} from "../utils/voiceConditions";
import {
  audienceSummary,
  isUnresolved,
  resolvedTag,
  situationWord,
  type VoiceLineRow,
} from "../utils/voiceLines";
import { LineEntry } from "./LineEntry";

/** The cells of a rule line that the arrows move between and Enter or F2 opens. */
export type LineCell = "name" | "chance" | "weight" | "priority" | "short";

/** A rule line of the view. */
export type RuleRow = Extract<VoiceLineRow, { kind: "rule" }>;

/** Returns the cells that a rule line offers, in draw order. */
export function lineCells(row: VoiceLineRow): LineCell[] {
  if (row.kind !== "rule") return [];

  const cells: LineCell[] = [];
  if (row.rule.name !== null) cells.push("name");
  if (row.rule.audio !== null) cells.push("short");
  cells.push("chance");
  if (row.situation.chooseRandom) cells.push("weight");
  cells.push("priority");
  return cells;
}

/**
 * The widths of the columns, which the column heads and every rule line share.
 *
 * The fixed columns lead and the conditions, the one column of prose, take the rest.
 */
const COLUMN = {
  name: "w-36 shrink-0",
  line: "w-80 shrink-0",
  heard: "w-[4.5rem] shrink-0",
  chance: "w-20 shrink-0",
  weight: "w-14 shrink-0 justify-end",
  priority: "w-14 shrink-0 justify-end",
  when: "min-w-24 flex-1",
} as const;

/** The width of the short name inside the Line column, so the tags of every line align. */
const SHORT_WIDTH = "w-60 min-w-0 shrink";

/** The caret slot and the play slot of a line, which a rule and the column heads leave empty. */
export function LeadSlots() {
  return (
    <>
      <span className="w-3 shrink-0" />
      <span className="w-5 shrink-0" />
    </>
  );
}

/** The classes of a number read out in a line. DS-MONO-SIZE. */
const NUMBER_CLASSES = "font-mono text-code tabular-nums text-surface-200";

/** The classes of the cell the arrows rest on. */
const ACTIVE_CELL = "rounded-sm ring-1 ring-accent-500/60";

const AUDIENCES: readonly Audience[] = ["owner", "ally", "enemy", "spectator"];

const AUDIENCE_LABELS: Record<Audience, () => string> = {
  owner: m.audio_event_audience_owner_label,
  ally: m.audio_event_audience_ally_label,
  enemy: m.audio_event_audience_enemy_label,
  spectator: m.audio_event_audience_spectator_label,
};

const AUDIENCE_SHORT_LABELS: Record<Audience, () => string> = {
  owner: m.audio_voice_audience_owner_short_label,
  ally: m.audio_voice_audience_ally_short_label,
  enemy: m.audio_voice_audience_enemy_short_label,
  spectator: m.audio_voice_audience_spectator_short_label,
};

/** Returns the label of `audience`. */
export function audienceLabel(audience: Audience): string {
  return AUDIENCE_LABELS[audience]();
}

/** The heads of the rule columns, drawn once above the list. */
export function ColumnHeads() {
  const head = (width: string, label: string) => (
    <span className={twMerge("flex px-1", width)}>{label}</span>
  );

  return (
    <div
      data-ui="VoiceLinesView:heads"
      className="flex h-6 items-center gap-2 pr-2 pl-1 text-fine font-medium tracking-wide text-surface-400 uppercase"
    >
      <LeadSlots />
      {head(COLUMN.name, m.audio_voice_column_rule_label())}
      {head(COLUMN.line, m.audio_voice_column_line_label())}
      {head(COLUMN.heard, m.audio_voice_column_heard_label())}
      {head(COLUMN.chance, m.audio_voice_column_chance_label())}
      {head(COLUMN.weight, m.audio_voice_column_weight_label())}
      {head(COLUMN.priority, m.audio_voice_column_priority_label())}
      {head(COLUMN.when, m.audio_voice_column_when_label())}
    </div>
  );
}

/**
 * The situation's word, its key where the word differs, the rule count, and the settings that
 * differ from the default: random choice, a cooldown and the count of unresolved rules.
 */
export function SituationText({
  situation,
  onToggleRandom,
}: {
  situation: VoiceSituation;
  /** Turns random choice off, or null while the document takes no edit. */
  onToggleRandom: (() => void) | null;
}) {
  const word = situationWord(situation.name);
  const cooldown = situation.cooldown ?? 0;
  const unresolved = situation.rules.filter(isUnresolved).length;

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium text-surface-100">
        {word ?? hashLabel(situation.key)}
      </span>
      {situation.name !== null && word !== situation.name && (
        <span className="shrink-0 font-mono text-code text-surface-400 select-text">
          {situation.name}
        </span>
      )}
      <span className="shrink-0 text-meta text-surface-400">
        {m.audio_voice_rules_label({ count: situation.rules.length })}
      </span>
      {situation.chooseRandom && onToggleRandom === null && (
        <Badge>{m.audio_voice_random_label()}</Badge>
      )}
      {situation.chooseRandom && onToggleRandom !== null && (
        <Tooltip content={m.audio_voice_pick_random_action()}>
          <Badge
            aria-pressed
            onClick={(event) => {
              event.stopPropagation();
              onToggleRandom();
            }}
          >
            {m.audio_voice_random_label()}
          </Badge>
        </Tooltip>
      )}
      {cooldown > 0 && (
        <span className="shrink-0 text-meta text-surface-400">
          {m.audio_voice_situation_cooldown_label({ seconds: String(cooldown) })}
        </span>
      )}
      {unresolved > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-meta text-warning-text">
          <WarningIcon weight="fill" className="size-3" aria-hidden />
          {m.audio_voice_unresolved_label({ count: unresolved })}
        </span>
      )}
    </span>
  );
}

/** The edits a rule line sends, each resolving `true` if it landed. */
export interface RuleLineEdits {
  /** Sets the chance of the rule, and of each picked rule with this one. */
  readonly chance: (percent: number) => Promise<boolean>;
  /** Adds a chance to the rule, and to each picked rule with this one that has none. */
  readonly addChance: () => Promise<boolean>;
  /** Sets the `ChanceWeight` of the rule, and of each picked rule with this one. */
  readonly weight: (weight: number) => Promise<boolean>;
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
  /** The tags of the chosen skin, which name the tag each event resolved through. */
  readonly tags: readonly string[];
  /** The event banks of the chosen skin, which a warning names. */
  readonly banks: readonly VoiceBank[];
  /** The edits of the line, or null while the document takes none. */
  readonly edits: RuleLineEdits | null;
}

/**
 * The cells of one rule line: the rule name, the line it plays with the tag it resolved through,
 * the audiences that hear it, the chance knob, the priority, and the conditions in words.
 *
 * The columns share their widths with `ColumnHeads`, so every line aligns under its head. A line
 * that resolves no event draws a warning that names the bank. Per "Rule lines" in
 * docs/ux/CONTEXTUAL_VOICE.md.
 */
export function RuleCells({
  row,
  active,
  entering,
  onEntering,
  tags,
  banks,
  edits,
}: RuleCellsProps) {
  const { rule } = row;
  const close = () => onEntering(null);
  const cell = (name: LineCell, width: string, children: ReactNode) => (
    <span
      className={twMerge("flex items-center gap-1.5 px-1", width, active === name && ACTIVE_CELL)}
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
      {cell(
        "short",
        COLUMN.line,
        <PlaysCell
          rule={rule}
          tags={tags}
          banks={banks}
          entering={entering === "short"}
          edits={edits}
          onClose={close}
        />,
      )}
      <HeardCell rule={rule} />
      {cell(
        "chance",
        COLUMN.chance,
        <ChanceCell
          rule={rule}
          active={active === "chance"}
          entering={entering === "chance"}
          edits={edits}
          onEntering={onEntering}
        />,
      )}
      {cell(
        "weight",
        COLUMN.weight,
        <WeightCell
          rule={rule}
          random={row.situation.chooseRandom}
          entering={entering === "weight"}
          edits={edits}
          onClose={close}
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
      <WhenCell rule={rule} />
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
    <span className={twMerge("truncate px-1 text-meta text-surface-300", COLUMN.when)}>
      {relationship !== null && <span className="text-surface-400">{relationship} </span>}
      {text}
    </span>
  );

  if (text === "") return body;
  return <Tooltip content={text}>{body}</Tooltip>;
}

function ChanceCell({
  rule,
  active,
  entering,
  edits,
  onEntering,
}: Omit<CellProps, "onClose"> & {
  active: boolean;
  onEntering: (cell: LineCell | null) => void;
}) {
  const chance = ruleChance(rule);
  const [draft, setDraft] = useState<{ value: number; over: number } | null>(null);
  if (draft !== null && chance !== null && draft.over !== chance.percent) setDraft(null);
  if (chance === null) {
    if (edits === null) return null;

    return (
      <span
        className={twMerge(
          "flex cursor-pointer items-center gap-1 text-meta text-surface-400 hover:text-surface-200",
          !active && "opacity-0 group-hover/row:opacity-100",
        )}
        onClick={(event) => {
          event.stopPropagation();
          void edits.addChance();
        }}
      >
        <PlusIcon weight="bold" className="size-3" aria-hidden />
        {m.audio_voice_column_chance_label()}
      </span>
    );
  }

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

/** The `ChanceWeight` that a random situation draws the rule by, or nothing elsewhere. */
function WeightCell({ rule, random, entering, edits, onClose }: CellProps & { random: boolean }) {
  if (!random) return null;

  const weight = rule.chanceWeight ?? 1;
  if (entering && edits !== null) {
    return (
      <LineEntry
        label={m.audio_voice_field_chance_weight_label()}
        initial={String(weight)}
        numeric="number"
        onCommit={(text) => edits.weight(text.trim() === "" ? 1 : Number(text))}
        onClose={onClose}
      />
    );
  }

  return <span className={NUMBER_CLASSES}>{weight}</span>;
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

/** The four audiences in fixed slots: a letter for each audience with a short name, else a dot. */
function HeardCell({ rule }: { rule: VoiceRule }) {
  const heard = new Set(audienceSummary(rule.audio).audiences);
  if (heard.size === 0) return <span className={COLUMN.heard} />;

  const names = AUDIENCES.filter((each) => heard.has(each))
    .map(audienceLabel)
    .join(", ");
  return (
    <Tooltip content={names}>
      <span
        role="img"
        aria-label={names}
        className={twMerge("flex items-center px-1 text-fine", COLUMN.heard)}
      >
        {AUDIENCES.map((audience) => (
          <span key={audience} className="flex w-4 justify-center">
            {heard.has(audience) && (
              <span className="font-medium text-surface-200">
                {AUDIENCE_SHORT_LABELS[audience]()}
              </span>
            )}
            {!heard.has(audience) && <span className="size-1 rounded-full bg-surface-600" />}
          </span>
        ))}
      </span>
    </Tooltip>
  );
}

/**
 * The line a rule plays: the short name it writes, and the tag its event resolved through or a
 * warning that names the skin's event bank. A rule without an audio action draws its animation or
 * its chained situation, muted.
 */
function PlaysCell({
  rule,
  tags,
  banks,
  entering,
  edits,
  onClose,
}: CellProps & { tags: readonly string[]; banks: readonly VoiceBank[] }) {
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
  if (line === null) return <OtherAction rule={rule} />;

  const others = new Set(rule.audio?.lines.map((each) => each.short).filter(Boolean)).size - 1;
  return (
    <>
      <span className={twMerge("flex items-center gap-1", SHORT_WIDTH)}>
        <span className="truncate text-surface-200 select-text">{line.short}</span>
        {summary.mixed && others > 0 && (
          <Tooltip content={m.audio_voice_mixed_names_hint()}>
            <span className="shrink-0 text-meta text-surface-400">
              {m.audio_voice_mixed_names_label({ count: String(others) })}
            </span>
          </Tooltip>
        )}
      </span>
      {line.event !== null && <ResolvedMark event={line.event.name} tags={tags} />}
      {line.event === null && <MissingMark banks={banks} />}
    </>
  );
}

/**
 * The tag that the event `event` resolved through, with the full event name on hover.
 *
 * A tag longer than another tag of the skin is the skin's own and takes the accent, so the lines
 * the skin overrides stand out from the lines it shares with the base.
 */
function ResolvedMark({ event, tags }: { event: string; tags: readonly string[] }) {
  const tag = resolvedTag(event, tags);
  if (tag === null) return null;

  const override = tags.some((other) => other.length < tag.length);
  const name = <span className="font-mono text-code select-text">{event}</span>;
  if (override) {
    return (
      <Tooltip content={name}>
        <Badge tone="accent" className="shrink-0">
          {tag}
        </Badge>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={name}>
      <span className="shrink-0 text-fine text-surface-400">{tag}</span>
    </Tooltip>
  );
}

/** The warning of a short name that no event of the skin's banks composes. */
function MissingMark({ banks }: { banks: readonly VoiceBank[] }) {
  const [bank] = banks;
  const text =
    bank === undefined
      ? m.audio_voice_no_bank_label()
      : m.audio_voice_no_event_label({ bank: lastSegment(bank.path) });

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span>{text}</span>
          <span className="text-surface-400">{m.audio_voice_no_event_hint()}</span>
        </span>
      }
    >
      <Badge
        tone="warning"
        className="shrink-0"
        icon={<WarningIcon weight="fill" className="size-2.5" />}
      >
        {m.audio_voice_missing_label()}
      </Badge>
    </Tooltip>
  );
}

/** What a rule without an audio action does: its animation or its chained situation, muted. */
function OtherAction({ rule }: { rule: VoiceRule }) {
  const muted = rule.animation ?? rule.trigger;
  if (muted === null) return null;

  const name = muted.name ?? hashLabel(muted.hash);
  const text =
    rule.animation !== null
      ? m.audio_voice_animation_label({ name })
      : m.audio_voice_chains_label({ name });
  return <span className="min-w-0 truncate text-meta text-surface-400">{text}</span>;
}

/** The add line under a situation's rules, which adds a rule on a press or Enter. */
export function AddRuleLine({ onAdd }: { onAdd: () => void }) {
  return (
    <span
      className="flex cursor-pointer items-center gap-1.5 px-1 text-meta text-surface-400 hover:text-surface-200"
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
