import { useState, type ReactNode } from "react";

import { OVERLINE, Select, Switch } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { FieldCard, schemaDeclared } from "../../bin/classes/components/FieldCard";
import { useClassSchema } from "../../bin/classes/hooks/useClassSchema";
import { nameHash } from "../../bin/shared/utils/binHash";
import {
  NAME_COLUMN_CLASSES,
  PROPERTY_ROW_CLASSES,
} from "../../shared/components/PropertyRowParts";
import {
  type TopicValue,
  VOICE_TOPICS,
  type VoiceFieldSection,
  type VoiceFieldTopic,
} from "../utils/voiceFieldTopics";
import { LineEntry } from "./LineEntry";

export const SECTION_TITLE: Record<VoiceFieldSection, () => string> = {
  rule: m.audio_voice_section_rule_label,
  cooldown: m.audio_voice_section_cooldown_label,
  plays: m.audio_voice_section_plays_label,
  situation: m.audio_voice_section_situation_label,
};

/** A labelled band of field rows, the band of the other inspectors. */
export function Band({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-ui="VoiceLineInspector:section"
      className="flex flex-col border-t border-surface-700/40 px-1.5 pb-1.5 first:border-t-0"
    >
      <h3
        className={twMerge(OVERLINE, "flex min-h-6 items-end justify-between px-1.5 pt-1.5 pb-0.5")}
      >
        <span>{title}</span>
        {action}
      </h3>
      {children}
    </section>
  );
}

interface TopicBandsProps {
  readonly topics: readonly VoiceFieldTopic[];
  readonly value: (topic: VoiceFieldTopic) => TopicValue;
  readonly onEdit: ((topic: VoiceFieldTopic, value: TopicValue) => Promise<boolean>) | null;
}

/** The topics grouped under their sections, in the order the topics list them. */
export function TopicBands({ topics, value, onEdit }: TopicBandsProps) {
  const sections = [...new Set(topics.map((topic) => VOICE_TOPICS[topic].section))];

  return sections.map((section) => (
    <Band key={section} title={SECTION_TITLE[section]()}>
      {topics
        .filter((topic) => VOICE_TOPICS[topic].section === section)
        .map((topic) => (
          <TopicRow
            key={topic}
            topic={topic}
            value={value(topic)}
            onEdit={onEdit === null ? null : (next) => onEdit(topic, next)}
          />
        ))}
    </Band>
  ));
}

/** The name cell of a field row: the label, and the field card of its class on hover. */
export function FieldName({
  holder,
  field,
  label,
}: {
  holder: string;
  field: string;
  label: string;
}) {
  const classHash = holder.startsWith("0x") ? holder : nameHash(holder);
  const fieldHash = field.startsWith("0x") ? field : nameHash(field);
  const schema = useClassSchema(classHash).data;

  return (
    <span
      className={twMerge("flex min-w-0 shrink-0 items-center self-stretch", NAME_COLUMN_CLASSES)}
    >
      <FieldCard
        classHash={classHash}
        fieldHash={fieldHash}
        name={field}
        label={label}
        unnamed={field.startsWith("0x")}
        declared={schemaDeclared(schema, fieldHash)}
        triggerClassName="font-medium text-surface-200"
      />
    </span>
  );
}

interface TopicRowProps {
  readonly topic: VoiceFieldTopic;
  readonly value: TopicValue;
  readonly onEdit: ((value: TopicValue) => Promise<boolean>) | null;
}

/** One field row of a topic: its documented name and the control of its kind. */
export function TopicRow({ topic, value, onEdit }: TopicRowProps) {
  const { holder, field, kind, label } = VOICE_TOPICS[topic];

  return (
    <div data-ui="VoiceLineInspector:field" className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
      <FieldName holder={holder} field={field} label={label()} />
      <TopicControl kind={kind} label={label()} value={value} onEdit={onEdit} />
    </div>
  );
}

interface TopicControlProps {
  readonly kind: (typeof VOICE_TOPICS)[VoiceFieldTopic]["kind"];
  readonly label: string;
  readonly value: TopicValue;
  readonly onEdit: ((value: TopicValue) => Promise<boolean>) | null;
}

/** The value of a field row, edited in place: a switch, a choice or a text entry. */
export function TopicControl({ kind, label, value, onEdit }: TopicControlProps) {
  if (kind === "bool") {
    return (
      <Switch
        aria-label={label}
        checked={value === true}
        disabled={onEdit === null}
        onCheckedChange={(checked) => void onEdit?.(checked)}
      />
    );
  }

  if (kind === "relationship") {
    return (
      <Select.Root
        value={value === 0 ? "all" : "one"}
        disabled={onEdit === null}
        onValueChange={(next) => void onEdit?.(next === "all" ? 0 : 1)}
      >
        <Select.Trigger aria-label={label} size="sm" className="w-36">
          <Select.Value>
            {(current: string | null) =>
              current === "one"
                ? m.audio_voice_relationship_one_label()
                : m.audio_voice_relationship_all_label()
            }
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="all">{m.audio_voice_relationship_all_label()}</Select.Item>
          <Select.Item value="one">{m.audio_voice_relationship_one_label()}</Select.Item>
        </Select.Content>
      </Select.Root>
    );
  }

  return <TextControl kind={kind} label={label} value={value} onEdit={onEdit} />;
}

/** A value shown as text that F2, Enter or a double click opens for an entry. */
export function TextControl({ kind, label, value, onEdit }: TopicControlProps) {
  const [entering, setEntering] = useState(false);
  const text = value === null ? "" : String(value);
  const numeric =
    kind === "integer" || kind === "priority"
      ? "integer"
      : kind === "number"
        ? "number"
        : undefined;

  if (entering && onEdit !== null) {
    return (
      <LineEntry
        label={label}
        initial={text}
        numeric={numeric}
        className="max-w-48"
        onCommit={(typed) => {
          if (numeric === undefined) return onEdit(typed);
          return onEdit(typed.trim() === "" ? null : Number(typed));
        }}
        onClose={() => setEntering(false)}
      />
    );
  }

  return (
    <span
      tabIndex={onEdit === null ? undefined : 0}
      className={twMerge(
        "min-w-0 truncate rounded-sm px-1.5 text-surface-200 focus-visible:ring-1 focus-visible:ring-accent-500/70 focus-visible:outline-none",
        numeric !== undefined && "font-mono text-code tabular-nums",
      )}
      onDoubleClick={() => setEntering(onEdit !== null)}
      onKeyDown={(event) => {
        if (event.key !== "F2" && event.key !== "Enter") return;
        event.preventDefault();
        setEntering(onEdit !== null);
      }}
    >
      {text}
    </span>
  );
}
