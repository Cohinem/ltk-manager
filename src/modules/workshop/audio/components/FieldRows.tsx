import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Combobox, Knob, useValueEntry, ValueEntry } from "@/components";
import { m } from "@/i18n";
import type { BankNode, EventNode } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { NAME_COLUMN_CLASSES, UnitSuffix } from "../../shared/components/PropertyRowParts";
import { audioQueries, type BankRevision } from "../api/queries";
import { useMixDraftStore } from "../state/mixDrafts";
import { useNodeNames } from "../state/nodeNames";
import { matchingNodes } from "../utils/bankEdits";
import { objectLabel } from "../utils/eventTree";
import { type FieldTopic, fieldTopic } from "../utils/fieldTopics";
import {
  type FieldDisplay,
  fieldDisplay,
  fieldEdit,
  fieldEntryText,
  type FieldUnit,
  knobRange,
  type NodeField,
  parseField,
} from "../utils/nodeFields";
import { nodeName, type NodeNames, nodeText } from "../utils/nodeNames";
import type { TreeEditing } from "../utils/treeEditing";
import { FieldDocName, topicLabel } from "./FieldDoc";
import { NamedId } from "./RowContent";

const UNIT_LABELS: Record<FieldUnit, () => string> = {
  dB: m.audio_edit_unit_db,
  cents: m.audio_edit_unit_cents,
  "%": m.audio_edit_unit_percent,
  s: m.audio_edit_unit_seconds,
};

/** The classes of a number read out in a row. DS-MONO-SIZE. */
const NUMBER_CLASSES = "font-mono text-code text-surface-200 tabular-nums";

interface FieldValueProps {
  readonly field: NodeField;
  /** The open document, or null if the field takes no edit. */
  readonly editing: TreeEditing | null;
  /** `true` while the value entry of the field is open. Held by the tree. */
  readonly entering: boolean;
  readonly onEntering: (open: boolean) => void;
  /** The entry or the knob was left, after any commit. */
  readonly onLeave: () => void;
  /** An edit of the field landed. */
  readonly onCommitted?: () => void;
  /** Draws the knob a size smaller. */
  readonly compact?: boolean;
}

/**
 * The value cell of a field row: the value as text in its unit, and a knob before a bounded one.
 *
 * The entry opens on a double click, F2 or Enter, as a popup under the knob or as a field in
 * place of the text. A knob sends one edit at the end of each gesture. Per "Editing" in
 * docs/ux/AUDIO.md.
 */
export function FieldValue({
  field,
  editing,
  entering,
  onEntering,
  onLeave,
  onCommitted,
  compact = false,
}: FieldValueProps) {
  const [draft, setDraft] = useState<{ value: number; over: number } | null>(null);
  if (draft !== null && draft.over !== field.value) setDraft(null);
  useMixDraft(field, draft?.value ?? null);

  const editable = editing !== null && field.editable && !editing.locked(field.target);
  const range = knobRange(field.name);
  const label = topicLabel(fieldTopic(field));
  const shown = { ...field, value: draft?.value ?? field.value };
  const display = fieldDisplay(shown);
  const unit = display.kind === "quantity" && display.unit !== null ? display.unit : null;
  const unitLabel = unit === null ? undefined : UNIT_LABELS[unit]();

  function turn(value: number) {
    setDraft({ value, over: field.value });
  }

  /* A draft that landed stays until the read of the edited bank replaces the value. */
  function send(value: number): Promise<boolean> {
    if (editing === null || value === field.value) {
      setDraft(null);
      return Promise.resolve(true);
    }

    setDraft({ value, over: field.value });
    return editing.edit(fieldEdit(field, value)).then((applied) => {
      if (applied) onCommitted?.();
      else setDraft(null);
      return applied;
    });
  }

  function openChange(open: boolean) {
    onEntering(open);
    if (!open) onLeave();
  }

  function parse(text: string) {
    return parseField(field, text);
  }

  const entry = useValueEntry({
    open: editable && entering && range === null,
    onOpenChange: openChange,
    initialText: () => fieldEntryText(field),
    parse,
    onCommit: send,
  });

  function knobKeys(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Escape") return;

    event.preventDefault();
    event.currentTarget.blur();
    onLeave();
  }

  const reference = field.name === "target" || field.name === "source";

  return (
    <span data-row-value className="flex min-w-0 items-center gap-2">
      <span className="flex w-5 shrink-0 justify-center" onKeyDown={knobKeys}>
        {range !== null && (
          <Knob
            value={shown.value}
            min={range.min}
            max={range.max}
            step={range.step}
            defaultValue={Math.min(range.max, Math.max(range.min, 0))}
            unit={unitLabel}
            format={(value) => fieldEntryText({ ...field, value })}
            parse={parse}
            entryOpen={editable && entering}
            onEntryOpenChange={openChange}
            disabled={!editable}
            className={compact ? "size-4" : undefined}
            aria-label={m.audio_edit_knob_label({ field: label })}
            onChange={turn}
            onCommit={send}
          />
        )}
      </span>
      {entry.entry === null && <FieldText display={display} />}
      {entry.entry !== null && (
        <span className="flex min-w-0 items-center gap-1">
          <ValueEntry
            entry={entry.entry}
            aria-label={label}
            className={reference ? "w-32" : undefined}
            onTextChange={entry.setText}
            onClose={entry.close}
          />
          {unitLabel !== undefined && <UnitSuffix unit={unitLabel} />}
        </span>
      )}
    </span>
  );
}

/**
 * Writes the draft `value` of a property `field` to the mix drafts while it is not null, so a
 * voice that plays follows the knob before the edit lands.
 */
function useMixDraft(field: NodeField, value: number | null) {
  const { target } = field;
  const object = target.kind === "property" ? target.object : null;
  const property = target.kind === "property" ? target.property : null;
  const setDraft = useMixDraftStore((state) => state.set);
  const clearDraft = useMixDraftStore((state) => state.clear);

  useEffect(() => {
    if (object === null || property === null) return;

    if (value === null) {
      clearDraft(object, property);
    } else {
      setDraft({ object, property, value });
    }
  }, [clearDraft, object, property, setDraft, value]);

  useEffect(
    () => () => {
      if (object !== null && property !== null) clearDraft(object, property);
    },
    [clearDraft, object, property],
  );
}

/** The text of a field's value at rest: a number in its unit, or the name an ID resolves to. */
function FieldText({ display }: { display: FieldDisplay }) {
  switch (display.kind) {
    case "quantity":
      return (
        <span className="flex shrink-0 items-baseline gap-1">
          <span className={NUMBER_CLASSES}>{display.number}</span>
          {display.unit !== null && (
            <span className="text-surface-400">{UNIT_LABELS[display.unit]()}</span>
          )}
        </span>
      );
    case "loop":
      return (
        <span className="text-surface-200">
          {display.plays === 0
            ? m.audio_edit_loop_forever()
            : m.audio_edit_loop_plays({ count: display.plays })}
        </span>
      );
    case "object":
      return <ObjectText id={display.id} node={display.node} />;
    case "media":
      return (
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={twMerge(
              "truncate",
              display.name === null ? "text-surface-400" : "text-surface-200",
            )}
          >
            {display.name ?? m.audio_event_media_missing_label()}
          </span>
          <span className="shrink-0 font-mono text-meta text-code text-surface-400">
            {objectLabel(display.id)}
          </span>
        </span>
      );
    case "weight":
      return (
        <span className="flex shrink-0 items-baseline gap-2">
          <span className={NUMBER_CLASSES}>{display.number}</span>
          {display.share !== null && (
            <span className="text-meta text-surface-400">
              {m.audio_edit_weight_share({ percent: String(Math.round(display.share * 100)) })}
            </span>
          )}
        </span>
      );
  }
}

/** The object that a `target` names: its derived name and its ID, or the ID alone. */
function ObjectText({ id, node }: { id: number; node: EventNode | null }) {
  const names = useNodeNames();
  if (node?.kind === "missing")
    return <span className="truncate text-surface-400">{nodeText(names, node)}</span>;

  const name = node === null ? names.nodes.get(id) : nodeName(names, node);
  if (name === undefined) {
    return <span className="truncate font-mono text-code text-surface-200">{objectLabel(id)}</span>;
  }

  return <NamedId name={name} id={id} />;
}

interface FieldNameCellProps {
  /** The field or the fact that the cell names and documents. */
  readonly topic: FieldTopic;
  /** The guides and the caret before the name. */
  readonly lead: ReactNode;
  /** The classes of the name. */
  readonly className?: string;
}

/** The name cell of a field row: the guides, the caret and the name with its field card. */
export function FieldNameCell({ topic, lead, className }: FieldNameCellProps) {
  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5 self-stretch",
        NAME_COLUMN_CLASSES,
      )}
    >
      {lead}
      <FieldDocName topic={topic} className={twMerge("text-surface-200", className)} />
    </span>
  );
}

interface NodePickerProps {
  readonly revision: BankRevision;
  /** The IDs that the list leaves out: the container and its children. */
  readonly exclude: ReadonlySet<number>;
  readonly onPick: (id: number) => void;
  readonly onClose: () => void;
}

/** Returns the name of `node` in the picker: its derived name, or else its kind. */
function pickedName(names: NodeNames, node: BankNode): string {
  return names.nodes.get(node.id) ?? node.kindName;
}

/**
 * The inline picker of a child to add: the sounds and containers of the bank set, filtered by
 * derived name, ID or kind as the text is typed.
 *
 * Enter adds the highlighted node and Escape closes the picker.
 */
export function NodePicker({ revision, exclude, onPick, onClose }: NodePickerProps) {
  const nodes = useQuery(audioQueries.nodes(revision));
  const names = useNodeNames();
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => matchingNodes(nodes.data ?? [], query, exclude, names),
    [nodes.data, query, exclude, names],
  );

  function nodeLabel(node: BankNode): string {
    return m.audio_node_named_label({ name: pickedName(names, node), id: String(node.id) });
  }

  return (
    <Combobox.Root<BankNode>
      items={matches}
      filter={null}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(node) => node && onPick(node.id)}
      onOpenChange={(open, details) => {
        if (!open && details.reason !== "item-press") onClose();
      }}
      itemToStringLabel={nodeLabel}
      defaultOpen
    >
      <Combobox.Input
        size="xs"
        autoFocus
        aria-label={m.audio_edit_add_child_label()}
        placeholder={m.audio_edit_add_child_label()}
        className="w-56"
        onClick={(event) => event.stopPropagation()}
      />
      <Combobox.Content positionerClassName="min-w-(--anchor-width)" className="max-h-72">
        <Combobox.List>
          {(node: BankNode) => (
            <Combobox.Item key={node.id} value={node} className="gap-2 pr-2">
              <span className="min-w-0 flex-1 truncate">{pickedName(names, node)}</span>
              <span className="shrink-0 font-mono text-code text-surface-400">
                {objectLabel(node.id)}
              </span>
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>{m.audio_edit_add_child_empty()}</Combobox.Empty>
      </Combobox.Content>
    </Combobox.Root>
  );
}
