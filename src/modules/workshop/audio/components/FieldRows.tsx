import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";

import { Combobox, Knob, useValueEntry, ValueEntry } from "@/components";
import { m } from "@/i18n";
import type { BankNode } from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  NAME_COLUMN_CLASSES,
  RowAction,
  UnitSuffix,
} from "../../shared/components/PropertyRowParts";
import { audioQueries, type BankRevision } from "../api/queries";
import { matchingNodes } from "../utils/bankEdits";
import { type EventRow, objectLabel } from "../utils/eventTree";
import {
  type FieldDisplay,
  fieldDisplay,
  fieldEdit,
  fieldEntryText,
  type FieldName,
  type FieldUnit,
  knobRange,
  type NodeField,
  parseField,
} from "../utils/nodeFields";
import type { TreeEditing } from "../utils/treeEditing";
import { nodeTitle } from "./RowContent";

const FIELD_LABELS: Record<FieldName, () => string> = {
  target: m.audio_edit_target_label,
  source: m.audio_edit_source_label,
  volume: m.audio_edit_volume_label,
  makeUpGain: m.audio_edit_make_up_gain_label,
  pitch: m.audio_edit_pitch_label,
  lpf: m.audio_edit_lpf_label,
  hpf: m.audio_edit_hpf_label,
  delay: m.audio_edit_delay_label,
  loopCount: m.audio_edit_loop_label,
  weight: m.audio_edit_weight_label,
};

const UNIT_LABELS: Record<FieldUnit, () => string> = {
  dB: m.audio_edit_unit_db,
  cents: m.audio_edit_unit_cents,
  "%": m.audio_edit_unit_percent,
  s: m.audio_edit_unit_seconds,
};

/** The name of the row that lists a container's children, as the field rows name theirs. */
const CHILDREN_NAME = "children";

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

  const editable = editing !== null && field.editable && !editing.locked(field.target);
  const range = knobRange(field.name);
  const label = FIELD_LABELS[field.name]();
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
      return (
        <span className="truncate text-surface-200">
          {display.node === null ? objectLabel(display.id) : nodeTitle(display.node)}
        </span>
      );
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

interface FieldNameCellProps {
  /** The name of the field, or null for a row without one. */
  readonly name: string | null;
  /** The guides and the caret before the name. */
  readonly lead: ReactNode;
}

/** The name cell of a field row or a children row: the guides, the caret and the name. */
export function FieldNameCell({ name, lead }: FieldNameCellProps) {
  if (name === null) return null;

  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5 self-stretch",
        NAME_COLUMN_CLASSES,
      )}
    >
      {lead}
      <span className="truncate text-surface-200">{name}</span>
    </span>
  );
}

/** Returns the name of a field row or a children row, or null for any other row. */
export function fieldName(row: EventRow): string | null {
  if (row.kind === "field") return row.field.name;
  if (row.kind === "children") return CHILDREN_NAME;

  return null;
}

interface ChildrenValueProps {
  readonly count: number;
  /** Opens the child picker. Absent if the container takes no added child. */
  readonly onAdd?: () => void;
}

/**
 * The value cell of a children row: the count, and the add action of an editable container.
 *
 * A double click on the count opens the child picker.
 */
export function ChildrenValue({ count, onAdd }: ChildrenValueProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="w-5 shrink-0" />
      <span
        className="text-surface-200"
        onDoubleClick={(event) => {
          if (onAdd === undefined) return;

          event.stopPropagation();
          onAdd();
        }}
      >
        {m.audio_edit_children_label({ count })}
      </span>
      {onAdd !== undefined && (
        <RowAction label={m.audio_edit_add_child_action()} icon={PlusIcon} onAct={onAdd} />
      )}
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

/** Returns the label of `node` in the picker: its kind and its decimal ID. */
function nodeLabel(node: BankNode): string {
  return m.audio_edit_node_option({ kind: node.kindName, id: String(node.id) });
}

/**
 * The inline picker of a child to add: the sounds and containers of the bank set, filtered by ID
 * or kind as the text is typed.
 *
 * Enter adds the highlighted node and Escape closes the picker.
 */
export function NodePicker({ revision, exclude, onPick, onClose }: NodePickerProps) {
  const nodes = useQuery(audioQueries.nodes(revision));
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => matchingNodes(nodes.data ?? [], query, exclude),
    [nodes.data, query, exclude],
  );

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
              <span className="min-w-0 flex-1 truncate">{nodeLabel(node)}</span>
            </Combobox.Item>
          )}
        </Combobox.List>
        <Combobox.Empty>{m.audio_edit_add_child_empty()}</Combobox.Empty>
      </Combobox.Content>
    </Combobox.Root>
  );
}
