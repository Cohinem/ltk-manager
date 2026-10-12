import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, use, useMemo, useState } from "react";

import { OVERLINE } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, BinRow, FieldSchema } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { nameHash } from "../../shared/utils/binHash";
import { RowDocumentContext } from "../../tree/state/rowFold";
import { type SpecialField, StructFields } from "../inspector/components/StructFields";
import { VfxRunContext } from "../playback/state/run";
import {
  BoneField,
  ChildAddPicker,
  ChildMarks,
  ChildRowActions,
  OpenChildButton,
  SpawnModeSwitch,
} from "./ChildControls";
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

/** The set's fields with Spawn on death, Picked child and Inheritance first. */
function arrange(classHash: string, fields: readonly FieldSchema[]): readonly FieldSchema[] {
  if (classHash !== SET_CLASS) return fields;

  const rank = (field: FieldSchema) => {
    const at = CHILD_SET_ROWS.indexOf(field.hash as (typeof CHILD_SET_ROWS)[number]);
    return at < 0 ? CHILD_SET_ROWS.length : at;
  };
  return [...fields].sort((left, right) => rank(left) - rank(right));
}

const special: SpecialField = (slot) => (OWN_ROWS.has(slot.field.hash) ? null : undefined);

/** Whether the section matches every term of `query`: its title, its controls or a child's name. */
export function childrenMatch(set: AuthoredChildSet, query: string): boolean {
  const text = [
    m.workshop_bin_children_title(),
    m.workshop_bin_child_mode_label(),
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
 * The systems the open emitter's particles spawn: the spawn mode, each child with its bone and
 * its actions, the picker that adds one, and the set's own fields.
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

  if (!visible || set === null || card === undefined) return null;
  if (searching && !childrenMatch(set, search)) return null;

  const open = searching || (expanded ?? set.children.length > 0);

  return (
    <section
      data-ui="ChildrenSection"
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
      {open && set.authored && (
        <Row label={m.workshop_bin_child_mode_label()}>
          <SpawnModeSwitch set={set} actions={actions} />
        </Row>
      )}
      {open && <ChildNotes set={set} />}
      {open &&
        set.children.map((child) => (
          <ChildRow key={child.index} set={set} child={child} actions={actions} />
        ))}
      {open && actions.add !== null && (
        <Row label={m.workshop_bin_child_add_action()}>
          <ChildAddPicker actions={actions} targets={targets} holder={card.row.entry} />
        </Row>
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

/** One line of the section: a name in the inspector's name column, and a control beside it. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center px-1.5">
      <span className={twMerge(NAME_COLUMN, "shrink-0 truncate pl-4 text-surface-300")}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center border-l border-surface-700/40 pl-2">
        {children}
      </div>
    </div>
  );
}

const NOTE = "px-1.5 pl-5.5 text-meta text-surface-400";

/** What the set's mode leaves unread or unspawned, one line each. */
export function ChildNotes({ set }: { set: AuthoredChildSet }) {
  const single = set.mode === "pick" && set.children.length === 1;

  return (
    <>
      {set.starved && (
        <p role="alert" className={twMerge(NOTE, "text-warning-text")}>
          {m.workshop_bin_child_starved_hint()}
        </p>
      )}
      {set.mode === "bones" && <p className={NOTE}>{m.workshop_bin_child_mode_bones_hint()}</p>}
      {single && <p className={NOTE}>{m.workshop_bin_child_single_hint()}</p>}
    </>
  );
}

interface ChildRowProps {
  set: AuthoredChildSet;
  child: AuthoredChild;
  actions: ChildActions;
}

/** One child: its place and system, its marks, its bone in a bone set, and its actions. */
function ChildRow({ set, child, actions }: ChildRowProps) {
  return (
    <div
      data-ui="ChildrenSection:child"
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
      {set.mode === "bones" && (
        <span className="w-32 shrink-0">
          <BoneField child={child} actions={actions} />
        </span>
      )}
      <OpenChildButton child={child} />
      <ChildRowActions child={child} count={set.children.length} actions={actions} />
    </div>
  );
}
