import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";

import { Combobox, Knob } from "@/components";
import { m } from "@/i18n";
import type { BankNode } from "@/lib/tauri";
import { twMerge } from "@/utils";

import {
  NAME_COLUMN_CLASSES,
  NumberCell,
  RowAction,
  RowKindTag,
} from "../../shared/components/PropertyRowParts";
import { audioQueries, type BankRevision } from "../api/queries";
import { matchingNodes } from "../utils/bankEdits";
import type { EventRow } from "../utils/eventTree";
import {
  type FieldName,
  fieldEdit,
  fieldText,
  knobRange,
  type NodeField,
  parseField,
} from "../utils/nodeFields";
import type { TreeEditing } from "../utils/treeEditing";

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

const FIELD_UNITS: Partial<Record<FieldName, () => string>> = {
  volume: m.audio_edit_unit_db,
  makeUpGain: m.audio_edit_unit_db,
  pitch: m.audio_edit_unit_cents,
  delay: m.audio_edit_unit_seconds,
};

/** The name of the row that lists a container's children, as the field rows name theirs. */
const CHILDREN_NAME = "children";

/** The kind tag of the children row, a list of object IDs. */
const CHILDREN_TAG = "list[u32]";

interface FieldValueProps {
  readonly field: NodeField;
  /** The open document, or null if the field takes no edit. */
  readonly editing: TreeEditing | null;
  /** A field or the knob was left, after any commit. */
  readonly onLeave: () => void;
}

/**
 * The value cell of a field row: the typed value with its unit, and a knob beside a bounded one.
 *
 * The text commits on Enter or blur and drops its draft on Escape. A text that holds no number
 * and a value that the backend refused keep the text, marked. A knob sends one edit at the end of
 * each gesture. Per "Editing" in docs/ux/AUDIO.md.
 */
export function FieldValue({ field, editing, onLeave }: FieldValueProps) {
  const [draft, setDraft] = useState<{ value: number; over: number } | null>(null);
  if (draft !== null && draft.over !== field.value) setDraft(null);

  const [invalid, setInvalid] = useState(false);
  const editable = editing !== null && field.editable;
  const range = knobRange(field.name);
  const label = FIELD_LABELS[field.name]();
  const unit = FIELD_UNITS[field.name]?.() ?? null;
  const shown = { ...field, value: draft?.value ?? field.value };

  function turn(value: number) {
    setDraft({ value, over: field.value });
  }

  /* A draft that landed stays until the read of the edited bank replaces the value. */
  function send(value: number) {
    if (editing === null || value === field.value) {
      setDraft(null);
      return;
    }

    void editing.edit(fieldEdit(field, value)).then((applied) => {
      setInvalid(!applied);
      if (!applied) setDraft(null);
    });
  }

  function commitText(text: string) {
    const parsed = parseField(field, text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    send(parsed);
  }

  function knobKeys(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Escape" && event.key !== "Enter") return;

    event.preventDefault();
    event.currentTarget.blur();
    onLeave();
  }

  return (
    <span data-row-value className="flex min-w-0 items-center gap-2">
      {range !== null && (
        <span className="flex" onKeyDown={knobKeys}>
          <Knob
            value={shown.value}
            min={range.min}
            max={range.max}
            step={range.step}
            defaultValue={Math.min(range.max, Math.max(range.min, 0))}
            unit={unit ?? undefined}
            format={(value) => fieldText({ ...field, value })}
            disabled={!editable}
            aria-label={m.audio_edit_knob_label({ field: label })}
            onChange={turn}
            onCommit={send}
          />
        </span>
      )}
      <NumberCell
        text={fieldText(shown)}
        unit={unit}
        step={field.tag === "u32" && field.name !== "weight" ? null : (range?.step ?? 1)}
        aria-label={label}
        invalid={invalid}
        onLeave={onLeave}
        onCommit={editable ? commitText : undefined}
      />
    </span>
  );
}

interface FieldNameCellProps {
  /** A field row or a children row. */
  readonly row: EventRow;
  /** The guides and the caret before the name. */
  readonly lead: ReactNode;
}

/** The name cell of a field row or a children row: the guides, the caret, the name and the tag. */
export function FieldNameCell({ row, lead }: FieldNameCellProps) {
  const naming = fieldNaming(row);
  if (naming === null) return null;

  const { name, tag } = naming;
  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5 self-stretch",
        NAME_COLUMN_CLASSES,
      )}
    >
      {lead}
      <span className="truncate text-surface-200">{name}</span>
      <RowKindTag tag={tag} />
    </span>
  );
}

/** Returns the kind tag and the name of a field row or a children row. */
export function fieldNaming(row: EventRow): { name: string; tag: string } | null {
  if (row.kind === "field") return { name: row.field.name, tag: row.field.tag };
  if (row.kind === "children") return { name: CHILDREN_NAME, tag: CHILDREN_TAG };

  return null;
}

interface ChildrenValueProps {
  readonly count: number;
  /** Opens the child picker. Absent if the container takes no added child. */
  readonly onAdd?: () => void;
}

/** The value cell of a children row: the count, and the add action of an editable container. */
export function ChildrenValue({ count, onAdd }: ChildrenValueProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-meta text-surface-400">{m.audio_edit_children_label({ count })}</span>
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
