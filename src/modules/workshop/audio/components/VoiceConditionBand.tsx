import { MinusCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Combobox } from "@/components";
import { m } from "@/i18n";
import {
  type BinDocumentId,
  type ClassChoice,
  type ValueEdit,
  type VoiceCondition,
  type VoiceConditionField,
  type VoiceRule,
} from "@/lib/tauri";
import { twMerge } from "@/utils";

import { ClassCard } from "../../bin/classes/components/ClassCard";
import { PROPERTY_ROW_CLASSES, RowAction } from "../../shared/components/PropertyRowParts";
import { voiceLinesQueries } from "../api/voiceLines";
import { conditionClassLabel, hashLabel, lastSegment } from "../utils/voiceConditions";
import { conditionsPath, objectPath } from "../utils/voiceEdits";
import type { TopicValue } from "../utils/voiceFieldTopics";
import { Band, FieldName, TopicControl } from "./VoiceFieldRows";

interface ConditionsBandProps {
  readonly rule: VoiceRule;
  readonly document: BinDocumentId;
  readonly entry: string;
  readonly onEdit: ((edits: readonly ValueEdit[]) => Promise<boolean>) | null;
}

/** The conditions of a rule, each a block of its fields, and the picker of one to add. */
export function ConditionsBand({ rule, document, entry, onEdit }: ConditionsBandProps) {
  const [adding, setAdding] = useState(false);

  return (
    <Band
      title={m.audio_voice_section_conditions_label()}
      action={
        onEdit !== null && (
          <RowAction
            label={m.audio_voice_add_condition_action()}
            icon={PlusIcon}
            onAct={() => setAdding(true)}
          />
        )
      }
    >
      {rule.conditions.map((condition) => (
        <ConditionBlock
          key={condition.path}
          condition={condition}
          depth={0}
          onEdit={onEdit}
          onRemove={
            onEdit === null ? null : () => onEdit([{ type: "removeItem", path: condition.path }])
          }
        />
      ))}
      {adding && onEdit !== null && (
        <ConditionPicker
          document={document}
          entry={entry}
          path={objectPath(conditionsPath(rule))}
          onPick={(choice) => {
            setAdding(false);
            void onEdit([
              {
                type: "insertItem",
                path: conditionsPath(rule),
                item: { index: null, key: null, class: choice.hash },
              },
            ]);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </Band>
  );
}

interface ConditionBlockProps {
  readonly condition: VoiceCondition;
  readonly depth: number;
  readonly onEdit: ((edits: readonly ValueEdit[]) => Promise<boolean>) | null;
  readonly onRemove: (() => void) | null;
}

/** One condition: its class, with the class card on hover, then a row per field it writes. */
function ConditionBlock({ condition, depth, onEdit, onRemove }: ConditionBlockProps) {
  const classHash = hashLabel(condition.class);

  return (
    <div className="flex flex-col" style={{ paddingLeft: `${depth * 12}px` }}>
      <div className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
        <span className="min-w-0 truncate font-medium text-surface-100">
          <ClassCard
            classHash={classHash}
            name={condition.className === null ? null : conditionClassLabel(condition)}
          />
        </span>
        {onRemove !== null && (
          <RowAction
            label={m.audio_voice_delete_condition_action()}
            icon={MinusCircleIcon}
            onAct={onRemove}
          />
        )}
      </div>
      {condition.fields.map((field) => (
        <ConditionFieldRow
          key={field.field}
          condition={condition}
          field={field}
          depth={depth}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

interface ConditionFieldRowProps {
  readonly condition: VoiceCondition;
  readonly field: VoiceConditionField;
  readonly depth: number;
  readonly onEdit: ((edits: readonly ValueEdit[]) => Promise<boolean>) | null;
}

/** One field of a condition: a leaf takes an entry, and a child condition draws as a block. */
function ConditionFieldRow({ condition, field, depth, onEdit }: ConditionFieldRowProps) {
  const name = field.name ?? hashLabel(field.field);
  const path = `${condition.path}.${field.field.toString(16).padStart(8, "0")}`;
  const { value } = field;
  const children =
    value.kind === "object"
      ? [value.condition]
      : value.kind === "list"
        ? value.items.map((item) => (item.kind === "object" ? item.condition : undefined))
        : [];
  const nested = children.filter((child): child is VoiceCondition => child != null);

  const leafEdit =
    onEdit === null
      ? null
      : (next: TopicValue) => {
          const leaf =
            value.kind === "bool"
              ? ({ type: "bool", value: next === true } as const)
              : value.kind === "float"
                ? ({ type: "float", value: Number(next) } as const)
                : value.kind === "integer"
                  ? ({ type: "integer", text: String(Math.round(Number(next))) } as const)
                  : ({ type: "string", value: String(next ?? "") } as const);
          return onEdit([{ type: "setLeaf", path, value: leaf }]);
        };
  const kind =
    value.kind === "bool"
      ? "bool"
      : value.kind === "integer"
        ? "integer"
        : value.kind === "float"
          ? "number"
          : "text";
  const editable =
    value.kind === "bool" ||
    value.kind === "integer" ||
    value.kind === "float" ||
    value.kind === "text";

  return (
    <>
      <div className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
        <FieldName
          holder={hashLabel(condition.class)}
          field={field.name ?? hashLabel(field.field)}
          label={name}
        />
        {editable && (
          <TopicControl
            kind={kind}
            label={name}
            value={
              value.kind === "text" || value.kind === "bool" ? value.value : (value.value ?? 0)
            }
            onEdit={leafEdit}
          />
        )}
        {!editable && nested.length === 0 && (
          <span className="min-w-0 truncate px-1.5 text-surface-300 select-text">
            {readOnlyText(field)}
          </span>
        )}
      </div>
      {nested.map((child) => (
        <ConditionBlock
          key={child.path}
          condition={child}
          depth={depth + 1}
          onEdit={onEdit}
          onRemove={null}
        />
      ))}
    </>
  );
}

/** The text of a field that the inspector does not edit in place: a hash, a list, a vector. */
function readOnlyText(field: VoiceConditionField): string {
  const { value } = field;
  if (value.kind === "hash")
    return value.hash.name === null ? hashLabel(value.hash.hash) : lastSegment(value.hash.name);
  if (value.kind === "list") {
    return value.items
      .map((item) => {
        if (item.kind === "hash")
          return item.hash.name === null ? hashLabel(item.hash.hash) : lastSegment(item.hash.name);
        if (item.kind === "text") return item.value;
        if (item.kind === "integer" || item.kind === "float") return String(item.value);
        return "";
      })
      .join(", ");
  }
  if (value.kind === "other") return value.shape;
  return "";
}

interface ConditionPickerProps {
  readonly document: BinDocumentId;
  readonly entry: string;
  /** The hash path of the conditions list from the object's root. */
  readonly path: string;
  readonly onPick: (choice: ClassChoice) => void;
  readonly onClose: () => void;
}

/** The inline picker of a condition class to add: the classes the list takes, filtered by name. */
function ConditionPicker({ document, entry, path, onPick, onClose }: ConditionPickerProps) {
  const [query, setQuery] = useState("");
  const classes = useQuery(voiceLinesQueries.conditionClasses(document, entry, path));
  const needle = query.toLowerCase();
  const matches = (classes.data ?? []).filter((choice) =>
    (choice.name ?? choice.hash).toLowerCase().includes(needle),
  );

  return (
    <div className="px-1.5 py-1">
      <Combobox.Root<ClassChoice>
        items={matches}
        filter={null}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(choice) => choice && onPick(choice)}
        onOpenChange={(open, details) => {
          if (!open && details.reason !== "item-press") onClose();
        }}
        itemToStringLabel={(choice) => choice.name ?? choice.hash}
        defaultOpen
      >
        <Combobox.Input
          size="xs"
          autoFocus
          aria-label={m.audio_voice_add_condition_label()}
          placeholder={m.audio_voice_add_condition_label()}
          className="w-full"
        />
        <Combobox.Content positionerClassName="min-w-(--anchor-width)" className="max-h-72">
          <Combobox.List>
            {(choice: ClassChoice) => (
              <Combobox.Item key={choice.hash} value={choice} className="pr-2">
                <span className="min-w-0 flex-1 truncate">{choice.name ?? choice.hash}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
          <Combobox.Empty>{m.audio_voice_add_condition_empty()}</Combobox.Empty>
        </Combobox.Content>
      </Combobox.Root>
    </div>
  );
}
