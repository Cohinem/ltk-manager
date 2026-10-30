import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Combobox, Readout } from "@/components";
import { m } from "@/i18n";
import type { BankEdit, BankNode, EventNode, NodeProperty, ObjectProperties } from "@/lib/tauri";

import { audioQueries, type BankRevision } from "../api/queries";
import {
  formatValue,
  matchingNodes,
  parseId,
  parseValue,
  parseWeight,
  PROPERTY_DEFAULTS,
  weightText,
} from "../utils/bankEdits";
import { childrenOf, type EventRow } from "../utils/eventTree";

/** What the event tree edits through: the open document, the values, and the edit call. */
export interface TreeEditing {
  readonly revision: BankRevision;
  /** The properties of the objects of the open trees, by object ID. */
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  /** The IDs of the objects whose bytes differ from the bank as it was opened. */
  readonly edited: ReadonlySet<number>;
  /** Applies one edit. Resolves false if the backend refused it. */
  readonly edit: (edit: BankEdit) => Promise<boolean>;
}

const PROPERTY_LABELS: Record<NodeProperty, () => string> = {
  volume: m.audio_edit_volume_label,
  pitch: m.audio_edit_pitch_label,
  lpf: m.audio_edit_lpf_label,
  delay: m.audio_edit_delay_label,
  loopCount: m.audio_edit_loop_label,
};

const PROPERTY_UNITS: Record<NodeProperty, (() => string) | null> = {
  volume: m.audio_edit_unit_db,
  pitch: m.audio_edit_unit_cents,
  lpf: null,
  delay: m.audio_edit_unit_seconds,
  loopCount: null,
};

/** Returns the object ID of an action row or a sound or container row, or null. */
export function rowObject(row: EventRow): number | null {
  if (row.kind === "action") return row.action.id;
  if (row.kind !== "node") return null;
  if (row.node.kind === "missing" || row.node.kind === "unsupported") return null;

  return row.node.id;
}

/** Returns the container node of `parent`, or null if the row above is not a container. */
export function containerOf(parent: EventRow | undefined): EventNode | null {
  if (parent?.kind !== "node") return null;

  return CONTAINER_KINDS.has(parent.node.kind) ? parent.node : null;
}

const CONTAINER_KINDS: ReadonlySet<EventNode["kind"]> = new Set([
  "random",
  "switch",
  "layer",
  "mixer",
]);

/** Returns `true` if a child is added to `node`: a random container or an actor-mixer. */
export function takesChild(node: EventNode): boolean {
  return node.kind === "random" || node.kind === "mixer";
}

/** Returns the object IDs of the children of `node`. */
export function childIds(node: EventNode): Set<number> {
  return new Set(childrenOf(node).map((child) => child.id));
}

interface RowPlatesProps {
  readonly row: EventRow;
  /** The row above `row` in the tree. */
  readonly parent: EventRow | undefined;
  readonly editing: TreeEditing;
  /** A plate was left, after any commit. */
  readonly onLeave: () => void;
}

/**
 * The value plates of one row: the target of a Play action, the source of a sound, every
 * property the object takes, and its weight in a random container's playlist.
 *
 * A plate commits on Enter or blur and drops its text on Escape. A refused value keeps its text,
 * marked. Per "Editing" in docs/ux/AUDIO.md.
 */
export function RowPlates({ row, parent, editing, onLeave }: RowPlatesProps) {
  const object = rowObject(row);
  if (object === null) return null;

  const id: number = object;
  const properties = editing.properties.get(id);
  const container = containerOf(parent);
  const containerProperties = container === null ? undefined : editing.properties.get(container.id);
  const weight = containerProperties?.weights?.items.find((item) => item.child === id);
  const editable = properties?.editable === true;
  const weighted = containerProperties?.editable === true && weight !== undefined;
  if (!editable && !weighted) return null;

  return (
    <span data-ui="EventTree:plates" className="flex shrink-0 items-center gap-2 text-meta">
      {editable && row.kind === "action" && row.action.target !== null && (
        <IdPlate
          label={m.audio_edit_target_label()}
          value={row.action.target}
          onCommit={(target) => editing.edit({ kind: "target", action: id, target })}
          onLeave={onLeave}
        />
      )}
      {editable && row.kind === "node" && row.node.kind === "sound" && (
        <IdPlate
          label={m.audio_edit_source_label()}
          value={row.node.source}
          onCommit={(source) => editing.edit({ kind: "source", sound: id, source })}
          onLeave={onLeave}
        />
      )}
      {editable &&
        properties.values.map(({ property, value }) => (
          <Plate
            key={property}
            label={PROPERTY_LABELS[property]()}
            unit={PROPERTY_UNITS[property]?.() ?? null}
            value={formatValue(value ?? PROPERTY_DEFAULTS[property])}
            parse={(text) => parseValue(text, property)}
            onCommit={(next) =>
              editing.edit({ kind: "property", object: id, property, value: next })
            }
            onLeave={onLeave}
          />
        ))}
      {weighted && container !== null && (
        <Plate
          label={m.audio_edit_weight_label()}
          unit={null}
          value={weightText(weight.weight)}
          parse={parseWeight}
          onCommit={(next) =>
            editing.edit({ kind: "weight", container: container.id, child: id, weight: next })
          }
          onLeave={onLeave}
        />
      )}
    </span>
  );
}

interface PlateProps {
  readonly label: string;
  readonly unit: string | null;
  readonly value: string;
  /** Returns the number that a text holds, or null for a text that holds none. */
  readonly parse: (text: string) => number | null;
  /** Applies the number. Resolves false if the backend refused it. */
  readonly onCommit: (value: number) => Promise<boolean>;
  readonly onLeave: () => void;
}

/** One labelled value plate with its unit. */
function Plate({ label, unit, value, parse, onCommit, onLeave }: PlateProps) {
  const [invalid, setInvalid] = useState(false);

  function commit(text: string) {
    const parsed = parse(text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    void onCommit(parsed).then((applied) => setInvalid(!applied));
  }

  return (
    <span className="flex items-center gap-1 text-surface-400">
      <span className="select-none">{label}</span>
      <Readout
        value={value}
        aria-label={label}
        className="w-16"
        invalid={invalid}
        onCommit={commit}
        onLeave={onLeave}
      />
      {unit !== null && <span className="select-none">{unit}</span>}
    </span>
  );
}

interface IdPlateProps {
  readonly label: string;
  readonly value: number;
  readonly onCommit: (id: number) => Promise<boolean>;
  readonly onLeave: () => void;
}

/** A plate that holds a decimal object or source ID. */
function IdPlate({ label, value, onCommit, onLeave }: IdPlateProps) {
  return (
    <Plate
      label={label}
      unit={null}
      value={String(value)}
      parse={parseId}
      onCommit={onCommit}
      onLeave={onLeave}
    />
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
