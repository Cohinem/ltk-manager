import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { use, useMemo, useState } from "react";

import { OVERLINE } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, FieldSchema } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { FieldRow } from "../../classes/components/ClassCells";
import { nameHash } from "../../shared/utils/binHash";
import { BinEditContext } from "../../tree/hooks/useBinEdit";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../tree/state/rowFold";
import { DefaultProperty } from "../inspector/components/DefaultProperty";
import {
  type FieldSlot,
  type SpecialField,
  StructFields,
} from "../inspector/components/StructFields";
import { defaultField } from "../inspector/utils/emitterGroups";
import { VfxRunContext } from "../playback/state/run";
import { ChildAddPicker } from "./ChildAddPicker";
import { BoneField, ChildMarks, ChildRowActions, OpenChildButton } from "./ChildControls";
import {
  type AuthoredChild,
  type AuthoredChildSet,
  CHILD_FIELD,
  CHILD_SET_CLASS,
  CHILD_SET_ROWS,
  systemLeaf,
} from "./childModel";
import { type ChildActions, childQueries, useChildActions, useChildren } from "./useChildren";

const NAME_COLUMN = "w-(--name-width)";
const SET_CLASS = nameHash(CHILD_SET_CLASS);

/** The set's rows the section draws itself, which the struct's own fields leave out. */
const OWN_ROWS: ReadonlySet<string> = new Set([CHILD_FIELD.children, CHILD_FIELD.bones]);

/** The set's fields with Spawn on death, Child index and Inheritance first. */
function arrange(classHash: string, fields: readonly FieldSchema[]): readonly FieldSchema[] {
  if (classHash !== SET_CLASS) return fields;

  const rank = (field: FieldSchema) => {
    const at = CHILD_SET_ROWS.indexOf(field.hash as (typeof CHILD_SET_ROWS)[number]);
    return at < 0 ? CHILD_SET_ROWS.length : at;
  };
  return [...fields].sort((left, right) => rank(left) - rank(right));
}

/**
 * The fields of the set the section draws its own way: nothing for the two lists its child rows
 * draw, and `childrenProbability` read-only while `unread`.
 */
function specialFields(unread: boolean): SpecialField {
  return function special(slot) {
    if (OWN_ROWS.has(slot.field.hash)) return null;
    if (unread && slot.field.hash === CHILD_FIELD.probability) return <UnreadIndex slot={slot} />;

    return undefined;
  };
}

/** Whether the section matches every term of `query`: its title, its controls or a child's name. */
export function childrenMatch(set: AuthoredChildSet, query: string): boolean {
  const text = [
    m.workshop_bin_children_title(),
    m.workshop_bin_child_bone_label(),
    "childParticleSetDefinition",
    ...set.children.map((child) => child.label),
  ]
    .join(" ")
    .toLocaleLowerCase();

  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

/**
 * The systems the open emitter's particles spawn: each child with its bone and its actions, the
 * picker that adds one, and the set's own fields.
 *
 * "Child particles" in docs/ux/BIN_EDITOR.md.
 */
export function ChildrenSection({ search }: { search: string }) {
  const { card, set, systemName, visible } = useChildren();
  const document = use(RowDocumentContext);
  const run = use(VfxRunContext);
  const targets = useQuery({
    ...childQueries.targets(run?.document ?? (0 as BinDocumentId)),
    enabled: run !== null && visible,
  }).data;
  const actions = useChildActions(card?.row ?? null, set, systemName, targets);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const searching = search.trim() !== "";
  const setRow = useMemo<BinRow | null>(() => {
    if (card === undefined || set === null || !set.authored) return null;

    return {
      entry: card.row.entry,
      path: set.hashPath,
      label: set.hashPath,
      node: "property",
      name: "childParticleSetDefinition",
      unnamed: false,
      kind: null,
      declared: null,
      value: { type: "struct", classHash: SET_CLASS, class: CHILD_SET_CLASS, len: set.fields },
    };
  }, [card, set]);
  const unread = set?.probabilityRead !== true;
  const special = useMemo(() => specialFields(unread), [unread]);

  if (!visible || set === null || card === undefined) return null;
  if (searching && !childrenMatch(set, search)) return null;

  const open = searching || (expanded ?? set.children.length > 0);

  return (
    <section
      data-ui="ChildrenSection"
      data-reveal-key={`${card.row.entry}:${set.hashPath}`}
      className="flex flex-col gap-0.5 border-t border-surface-700/40 py-1 font-sans text-row"
    >
      <button
        type="button"
        aria-expanded={open}
        disabled={searching}
        onClick={() => setExpanded(!open)}
        className={twMerge(
          OVERLINE,
          "flex min-h-6 cursor-pointer items-center gap-1 px-1.5 text-left hover:text-surface-200",
        )}
      >
        <CaretRightIcon weight="bold" className={twMerge("size-3", open && "rotate-90")} />
        {m.workshop_bin_children_title()}
      </button>
      {open && set.children.length === 0 && (
        <p className="px-1.5 text-meta text-surface-400">{m.workshop_bin_children_empty()}</p>
      )}
      {open && set.starved && (
        <p role="alert" className="px-1.5 pl-5.5 text-meta text-warning-text">
          {m.workshop_bin_child_starved_hint()}
        </p>
      )}
      {open &&
        set.children.map((child) => (
          <ChildRow
            key={child.index}
            entry={card.row.entry}
            set={set}
            child={child}
            actions={actions}
          />
        ))}
      {open && actions.add !== null && (
        <div className="flex min-h-6 items-center px-1.5 pl-5.5">
          <ChildAddPicker actions={actions} systems={targets} holder={card.row.entry} />
        </div>
      )}
      {open && document !== null && setRow !== null && (
        <StructFields
          document={document}
          row={setRow}
          classHash={SET_CLASS}
          width={NAME_COLUMN}
          depth={0}
          arrange={arrange}
          special={special}
        />
      )}
    </section>
  );
}

/**
 * `childrenProbability` of a set that does not read it, drawn dimmed and taking no edit: a set
 * that writes a bone, or one with a single child.
 */
function UnreadIndex({ slot }: { slot: FieldSlot }) {
  const { field, child, holder, owner, width, depth } = slot;

  return (
    <div data-ui="ChildrenSection:unread-index" aria-disabled className="opacity-50">
      <LeafEditContext value={null}>
        <BinEditContext value={null}>
          {child !== undefined && (
            <FieldRow row={child} tableLayout width={width} depth={depth} owner={owner} />
          )}
          {child === undefined && (
            <DefaultProperty
              field={defaultField(field)}
              holder={holder}
              width={width}
              owner={owner}
              depth={depth}
            />
          )}
        </BinEditContext>
      </LeafEditContext>
    </div>
  );
}

interface ChildRowProps {
  /** The entry of the emitter's system, which keys the row for a reveal. */
  entry: string;
  set: AuthoredChildSet;
  child: AuthoredChild;
  actions: ChildActions;
}

/** One child: its place and system, its marks, its bone and its actions. */
function ChildRow({ entry, set, child, actions }: ChildRowProps) {
  return (
    <div
      data-ui="ChildrenSection:child"
      data-reveal-key={`${entry}:${child.hashPath}`}
      className="flex min-h-6 items-center gap-1 px-1.5 pl-5.5 hover:bg-surface-veil"
    >
      <span className="shrink-0 text-meta text-surface-500">[{child.index}]</span>
      <span
        className={twMerge(
          "min-w-0 flex-1 truncate text-surface-200 select-text",
          child.system === null && "text-surface-400",
        )}
      >
        {systemLeaf(child.label)}
      </span>
      <ChildMarks set={set} child={child} />
      <span className="w-28 shrink-0">
        <BoneField child={child} actions={actions} />
      </span>
      <OpenChildButton child={child} />
      <ChildRowActions child={child} count={set.children.length} actions={actions} />
    </div>
  );
}
