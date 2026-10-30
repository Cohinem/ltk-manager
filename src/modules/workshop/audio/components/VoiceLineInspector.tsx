import { m } from "@/i18n";
import type {
  AudienceLine,
  BinDocumentId,
  ValueEdit,
  VoiceRule,
  VoiceSituation,
} from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  NAME_COLUMN_CLASSES,
  nameColumnStyle,
  PROPERTY_ROW_CLASSES,
} from "../../shared/components/PropertyRowParts";
import { hashLabel } from "../utils/voiceConditions";
import { AUDIENCE_FIELD, shortNameEdits } from "../utils/voiceEdits";
import {
  ruleTopics,
  ruleValue,
  SITUATION_TOPICS,
  situationValue,
  topicEdits,
  VOICE_TOPICS,
} from "../utils/voiceFieldTopics";
import { PlayButton } from "./EventRowParts";
import { ConditionsBand } from "./VoiceConditionBand";
import {
  Band,
  FieldName,
  SECTION_TITLE,
  TextControl,
  TopicBands,
  TopicRow,
} from "./VoiceFieldRows";
import { audienceLabel } from "./VoiceLineRows";

/** The width of the name column of the inspector's field rows, in characters. */
const NAME_COLS = 18;

/** What the inspector shows: one situation, or the picked rules with their situations. */
export type InspectorSubject =
  | { readonly kind: "situation"; readonly situation: VoiceSituation }
  | { readonly kind: "rules"; readonly rules: readonly VoiceRule[] };

interface VoiceLineInspectorProps {
  readonly subject: InspectorSubject | null;
  /** The open document and the object, which the add-condition picker reads the classes of. */
  readonly document: BinDocumentId;
  readonly entry: string;
  /** Sends the edits of `mSituations` as one step, or null while the document takes none. */
  readonly onEdit: ((edits: readonly ValueEdit[]) => Promise<boolean>) | null;
  /** Plays the line `line` of the rule `rule`. */
  readonly onPlay: (rule: VoiceRule, line: AudienceLine) => void;
  /** The key of the line that plays, by rule path and audience. */
  readonly playing: string | null;
}

/**
 * The inspector pane of the Voice lines view: every field of the selected rule or situation as
 * field rows, under the sections Rule, Cooldown, Conditions, Plays and Other actions.
 *
 * A field's name opens the field card of its class, which carries the meta wiki's prose. With
 * several rules picked, the pane lists the rule fields, and an edit sets each pick in one step.
 * Each condition is a block of its fields, with a delete action, and Add condition lists the
 * classes the list takes. Per "Inspector" in docs/ux/CONTEXTUAL_VOICE.md.
 */
export function VoiceLineInspector({
  subject,
  document,
  entry,
  onEdit,
  onPlay,
  playing,
}: VoiceLineInspectorProps) {
  return (
    <aside
      aria-label={m.audio_inspector_label()}
      data-ui="VoiceLineInspector"
      className="flex w-96 shrink-0 flex-col self-start border-l border-surface-700/60 text-row select-none"
      style={nameColumnStyle(NAME_COLS)}
    >
      <InspectorBody
        subject={subject}
        document={document}
        entry={entry}
        onEdit={onEdit}
        onPlay={onPlay}
        playing={playing}
      />
    </aside>
  );
}

function InspectorBody({
  subject,
  document,
  entry,
  onEdit,
  onPlay,
  playing,
}: VoiceLineInspectorProps) {
  if (subject === null) {
    return (
      <p className="px-3 py-2 text-meta text-surface-400">{m.audio_voice_inspector_empty()}</p>
    );
  }

  if (subject.kind === "situation") {
    const { situation } = subject;
    return (
      <Band title={SECTION_TITLE.situation()}>
        {SITUATION_TOPICS.map((topic) => (
          <TopicRow
            key={topic}
            topic={topic}
            value={situationValue(situation, topic)}
            onEdit={
              onEdit === null ? null : (value) => onEdit(topicEdits(situation.path, topic, value))
            }
          />
        ))}
      </Band>
    );
  }

  const [rule, ...rest] = subject.rules;
  if (rule === undefined) return null;

  if (rest.length > 0) {
    const shared = ruleTopics(rule).filter((topic) => topic !== "name");
    return (
      <>
        <div className="flex flex-col gap-0.5 px-3 pt-2 pb-1.5">
          <span className="font-medium text-surface-100">
            {m.audio_voice_selection_label({ count: String(subject.rules.length) })}
          </span>
          <span className="text-meta text-surface-400">{m.audio_voice_shared_hint()}</span>
        </div>
        <TopicBands
          topics={shared}
          value={(topic) => ruleValue(rule, topic)}
          onEdit={
            onEdit === null
              ? null
              : (topic, value) =>
                  onEdit(subject.rules.flatMap((each) => topicEdits(each.path, topic, value)))
          }
        />
      </>
    );
  }

  return (
    <>
      <TopicBands
        topics={ruleTopics(rule).filter((topic) => VOICE_TOPICS[topic].section !== "plays")}
        value={(topic) => ruleValue(rule, topic)}
        onEdit={
          onEdit === null ? null : (topic, value) => onEdit(topicEdits(rule.path, topic, value))
        }
      />
      <ConditionsBand rule={rule} document={document} entry={entry} onEdit={onEdit} />
      {rule.audio !== null && (
        <PlaysBand rule={rule} onEdit={onEdit} onPlay={onPlay} playing={playing} />
      )}
      {(rule.animation !== null || rule.trigger !== null) && <ActionsBand rule={rule} />}
    </>
  );
}

interface PlaysBandProps {
  readonly rule: VoiceRule;
  readonly onEdit: ((edits: readonly ValueEdit[]) => Promise<boolean>) | null;
  readonly onPlay: (rule: VoiceRule, line: AudienceLine) => void;
  readonly playing: string | null;
}

/** The short name of each audience with the event it resolves to, then the action's fields. */
function PlaysBand({ rule, onEdit, onPlay, playing }: PlaysBandProps) {
  const audio = rule.audio;
  if (audio === null) return null;

  return (
    <Band title={SECTION_TITLE.plays()}>
      {audio.lines.map((line) => (
        <div key={line.audience} className="flex flex-col">
          <div className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
            <FieldName
              holder="ContextualActionPlayVO"
              field={AUDIENCE_FIELD[line.audience]}
              label={audienceLabel(line.audience)}
            />
            <TextControl
              kind="text"
              label={audienceLabel(line.audience)}
              value={line.short}
              onEdit={
                onEdit === null
                  ? null
                  : (value) => onEdit(shortNameEdits(rule.path, line.audience, String(value ?? "")))
              }
            />
          </div>
          {line.short !== "" && (
            <div className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
              <span className={twMerge("shrink-0", NAME_COLUMN_CLASSES)} />
              <PlayButton
                playable={line.event !== null}
                playing={playing === `${rule.path}:${line.audience}`}
                onToggle={() => onPlay(rule, line)}
              />
              <span
                className={twMerge(
                  "min-w-0 truncate text-meta",
                  line.event === null ? "text-warning-text" : "text-surface-300 select-text",
                )}
              >
                {line.event?.name ?? m.audio_voice_no_event_hint()}
              </span>
            </div>
          )}
        </div>
      ))}
      {(["maxPlays", "waitForAnnouncer", "waitTimeout"] as const).map((topic) => (
        <TopicRow
          key={topic}
          topic={topic}
          value={ruleValue(rule, topic)}
          onEdit={onEdit === null ? null : (value) => onEdit(topicEdits(rule.path, topic, value))}
        />
      ))}
    </Band>
  );
}

/** The animation and trigger actions of a rule, read-only. */
function ActionsBand({ rule }: { rule: VoiceRule }) {
  const rows = [
    {
      holder: "ContextualActionPlayAnimation",
      field: "mHashedAnimationName",
      value: rule.animation,
    },
    {
      holder: "ContextualActionTriggerEvent",
      field: "mHashedSituationTrigger",
      value: rule.trigger,
    },
  ];

  return (
    <Band title={m.audio_voice_section_actions_label()}>
      {rows.map(
        (row) =>
          row.value !== null && (
            <div key={row.field} className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
              <FieldName holder={row.holder} field={row.field} label={row.field} />
              <span className="min-w-0 truncate px-1.5 text-surface-300 select-text">
                {row.value.name ?? hashLabel(row.value.hash)}
              </span>
            </div>
          ),
      )}
    </Band>
  );
}
