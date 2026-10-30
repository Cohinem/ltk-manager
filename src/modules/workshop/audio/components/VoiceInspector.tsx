import { CaretRightIcon } from "@phosphor-icons/react";
import { Fragment, type KeyboardEvent, useRef, useState } from "react";

import { m } from "@/i18n";
import type { ObjectProperties } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { nameColumnStyle, PROPERTY_ROW_CLASSES } from "../../shared/components/PropertyRowParts";
import { useNodeNames } from "../state/nodeNames";
import { eventLabel, objectLabel } from "../utils/eventTree";
import {
  type InspectorFact,
  type InspectorSection,
  inspectorSections,
  sharedFields,
} from "../utils/inspector";
import type { NodeField } from "../utils/nodeFields";
import { nodeName, type NodeNames } from "../utils/nodeNames";
import type { TreeEditing } from "../utils/treeEditing";
import type { VoiceRow } from "../utils/voices";
import { FieldNameCell, FieldValue } from "./FieldRows";
import { NamedId } from "./RowContent";
import { groupText } from "./VoiceRowParts";

interface VoiceInspectorProps {
  /** The rows that the inspector shows: the picked rows in draw order, or the selected row. */
  readonly subjects: readonly VoiceRow[];
  /** The drawn rows by key, which the path of a subject reads. */
  readonly byKey: ReadonlyMap<string, VoiceRow>;
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  /** The open document that the fields edit, or null for a view that takes no edit. */
  readonly editing: TreeEditing | null;
  /** Plays once what an edit of a field of `row` changed. */
  readonly onReplay: (row: VoiceRow) => void;
}

/** The width of the name column of the inspector's field rows, in characters. */
const NAME_COLS = 12;

/**
 * The inspector pane of the Voices view: every field of the selected row's objects as field rows.
 *
 * It lists the subject's path as muted text, then one band per object of `inspectorSections`,
 * with the fields that the rows hide and the container facts. With several rows picked, it lists
 * the properties that they share, and an edit applies to each pick. A field row is a tab stop,
 * and F2, Enter or a double click opens its entry. Per "Inspector" in docs/ux/AUDIO.md.
 */
export function VoiceInspector({
  subjects,
  byKey,
  properties,
  editing,
  onReplay,
}: VoiceInspectorProps) {
  const names = useNodeNames();
  const [only, ...rest] = subjects;

  return (
    <aside
      aria-label={m.audio_inspector_label()}
      data-ui="VoiceInspector"
      className="flex w-80 shrink-0 flex-col overflow-auto border-l border-surface-700/60 text-row scrollbar-md select-none"
      style={nameColumnStyle(NAME_COLS)}
    >
      {only === undefined && (
        <p className="px-3 py-2 text-meta text-surface-400">{m.audio_inspector_empty()}</p>
      )}
      {only !== undefined && rest.length === 0 && (
        <SubjectView
          row={only}
          path={subjectPath(only, byKey, names)}
          sections={inspectorSections(only, properties)}
          editing={editing}
          onReplay={onReplay}
        />
      )}
      {only !== undefined && rest.length > 0 && (
        <SharedView
          subjects={subjects}
          properties={properties}
          editing={editing}
          onReplay={onReplay}
        />
      )}
    </aside>
  );
}

/** Returns the names on the path from the Play action down to `row`, the row's own name last. */
function subjectPath(
  row: VoiceRow,
  byKey: ReadonlyMap<string, VoiceRow>,
  names: NodeNames,
): string[] {
  const path: string[] = [];
  let at: VoiceRow | undefined = row;
  while (at !== undefined && at.kind !== "event") {
    if (at.kind === "group") path.unshift(groupText(at.group, names, null, at.weighted).name);
    if (at.kind === "voice") path.unshift(nodeName(names, at.line.voice.node));
    at = at.parent === null ? undefined : byKey.get(at.parent);
  }
  if (path.length === 0) return path;

  return [m.audio_node_play_label(), ...path];
}

interface SubjectViewProps {
  readonly row: VoiceRow;
  readonly path: readonly string[];
  readonly sections: readonly InspectorSection[];
  readonly editing: TreeEditing | null;
  readonly onReplay: (row: VoiceRow) => void;
}

function SubjectView({ row, path, sections, editing, onReplay }: SubjectViewProps) {
  return (
    <>
      <div className="flex flex-col gap-0.5 px-3 pt-2 pb-1.5">
        {row.kind === "event" && (
          <span className="truncate font-medium text-surface-100 select-text">
            {eventLabel(row.event)}
          </span>
        )}
        {path.length > 0 && <SubjectPath path={path} />}
      </div>
      {sections.length === 0 && (
        <p className="px-3 py-1 text-meta text-surface-400">
          {m.audio_inspector_no_fields_empty()}
        </p>
      )}
      {sections.map((section, at) => (
        <SectionBand
          key={sectionKey(section)}
          section={section}
          first={at === 0}
          editing={editing}
          onCommitted={() => onReplay(row)}
        />
      ))}
    </>
  );
}

/** The muted, read-only path of the subject, joined by carets. */
function SubjectPath({ path }: { path: readonly string[] }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1 text-meta text-surface-400">
      {path.map((name, at) => (
        <Fragment key={at}>
          {at > 0 && <CaretRightIcon aria-hidden weight="bold" className="size-2.5 shrink-0" />}
          <span className="truncate">{name}</span>
        </Fragment>
      ))}
    </span>
  );
}

function sectionKey(section: InspectorSection): string {
  return section.owner.kind === "action"
    ? `a${section.owner.action.id}`
    : `n${section.owner.node.id}`;
}

interface SectionBandProps {
  readonly section: InspectorSection;
  /** `true` for the band of the subject's own object, which draws no rule above it. */
  readonly first: boolean;
  readonly editing: TreeEditing | null;
  readonly onCommitted: () => void;
}

/** One object's band: its name and ID, its field rows and its facts. */
function SectionBand({ section, first, editing, onCommitted }: SectionBandProps) {
  const names = useNodeNames();
  const { owner } = section;
  const name =
    owner.kind === "action"
      ? (names.actions.get(owner.action.id) ?? owner.action.label ?? m.audio_node_play_label())
      : nodeName(names, owner.node);
  const id = owner.kind === "action" ? owner.action.id : owner.node.id;

  return (
    <section
      className={twMerge(
        "flex flex-col px-1.5 pb-1.5",
        !first && "border-t border-surface-700/40 pt-1.5",
      )}
    >
      <span className="px-1.5 py-0.5">
        <NamedId name={name} id={id} />
      </span>
      <FieldList fields={section.fields} editing={editing} onCommitted={onCommitted} />
      {section.facts.map((fact) => (
        <FactRow key={fact.kind} fact={fact} />
      ))}
    </section>
  );
}

interface FieldListProps {
  readonly fields: readonly NodeField[];
  readonly editing: TreeEditing | null;
  readonly onCommitted: () => void;
}

function FieldList({ fields, editing, onCommitted }: FieldListProps) {
  const [entering, setEntering] = useState<string | null>(null);

  return fields.map((field) => (
    <FieldRow
      key={field.name}
      field={field}
      editing={editing}
      entering={entering === field.name}
      onEntering={(open) =>
        setEntering((current) => (open ? field.name : current === field.name ? null : current))
      }
      onCommitted={onCommitted}
    />
  ));
}

interface FieldRowProps {
  readonly field: NodeField;
  readonly editing: TreeEditing | null;
  readonly entering: boolean;
  readonly onEntering: (open: boolean) => void;
  readonly onCommitted: () => void;
}

/** One field row of the inspector, a tab stop whose entry opens on F2, Enter or a double click. */
function FieldRow({ field, editing, entering, onEntering, onCommitted }: FieldRowProps) {
  const row = useRef<HTMLDivElement>(null);
  const editable = editing !== null && field.editable;

  /* An entry that commits or drops its text leaves focus on no element, and the row takes it
     back, so the next Tab starts from the field that was edited. */
  function returnFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) row.current?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !editable) return;
    if (event.key !== "F2" && event.key !== "Enter") return;

    event.preventDefault();
    onEntering(true);
  }

  return (
    <div
      ref={row}
      tabIndex={0}
      data-ui="VoiceInspector:field"
      className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => {
        if (editable) onEntering(true);
      }}
    >
      <FieldNameCell name={field.name} lead={null} />
      <FieldValue
        field={field}
        editing={editing}
        entering={entering}
        onEntering={onEntering}
        onLeave={returnFocus}
        onCommitted={onCommitted}
      />
    </div>
  );
}

const FACT_LABELS: Record<InspectorFact["kind"], () => string> = {
  playlist: m.audio_inspector_playlist_label,
  pick: m.audio_inspector_pick_label,
  switchGroup: m.audio_inspector_switch_group_label,
  defaultSwitch: m.audio_inspector_default_switch_label,
};

/** Returns the text of the value of `fact`. */
function factText(fact: InspectorFact): string {
  switch (fact.kind) {
    case "playlist":
      return fact.mode === "sequence"
        ? m.audio_voices_sequence_label()
        : m.audio_voices_random_label();
    case "pick":
      return fact.weighted
        ? m.audio_inspector_pick_weighted_label()
        : m.audio_inspector_pick_equal_label();
    case "switchGroup":
    case "defaultSwitch":
      return objectLabel(fact.id);
  }
}

/** A read-only row of a container fact, aligned with the field rows. */
function FactRow({ fact }: { fact: InspectorFact }) {
  const mono = fact.kind === "switchGroup" || fact.kind === "defaultSwitch";

  return (
    <div className={twMerge(PROPERTY_ROW_CLASSES, "pl-1.5")}>
      <FieldNameCell name={FACT_LABELS[fact.kind]()} lead={null} />
      <span className="w-5 shrink-0" />
      <span
        className={twMerge(
          "truncate text-surface-200 select-text",
          mono && "font-mono text-code tabular-nums",
        )}
      >
        {factText(fact)}
      </span>
    </div>
  );
}

interface SharedViewProps {
  readonly subjects: readonly VoiceRow[];
  readonly properties: ReadonlyMap<number, ObjectProperties>;
  readonly editing: TreeEditing | null;
  readonly onReplay: (row: VoiceRow) => void;
}

/** The fields that several picked rows share, per `sharedFields`. */
function SharedView({ subjects, properties, editing, onReplay }: SharedViewProps) {
  const lists = subjects.map((row) => inspectorSections(row, properties)[0]?.fields ?? []);
  const fields = sharedFields(lists);
  const [first] = subjects;

  return (
    <>
      <div className="flex flex-col gap-0.5 px-3 pt-2 pb-1.5">
        <span className="font-medium text-surface-100">
          {m.audio_selection_count_label({ count: subjects.length })}
        </span>
        <span className="text-meta text-surface-400">{m.audio_inspector_shared_hint()}</span>
      </div>
      {fields.length === 0 && (
        <p className="px-3 py-1 text-meta text-surface-400">
          {m.audio_inspector_no_fields_empty()}
        </p>
      )}
      <div className="flex flex-col px-1.5 pb-1.5">
        <FieldList
          fields={fields}
          editing={editing}
          onCommitted={() => {
            if (first !== undefined) onReplay(first);
          }}
        />
      </div>
    </>
  );
}
