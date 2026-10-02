import { use, useMemo } from "react";

import { m } from "@/i18n";
import type { FieldSchema } from "@/lib/tauri";

import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { addForceEdits } from "../../forces/forceEdits";
import { FORCE_COLLECTION, FORCE_DEFINITIONS } from "../../forces/forceModel";
import {
  type DefaultField,
  type EmitterGroup,
  GROUP_ORDER,
  unauthoredFields,
} from "../../inspector/utils/emitterGroups";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import type { MasterItem, RenderItem } from "../utils/graphItems";
import { holderRow } from "../utils/holderRow";
import { groupTitle } from "../utils/nodeText";
import {
  COMPONENT_GROUP,
  componentOf,
  FORCE_FIELD,
  FORCE_GROUP,
  masterGroup,
} from "../utils/renderSection";
import { type AddChoice, AddMenu, type AddSection } from "./AddMenu";
import { GraphActionsContext } from "./graphActions";

/**
 * The fields of class `classHash` the emitter does not write, less the force collection,
 * which a force's own Add writes when it is missing.
 */
function useUnwritten(classHash: string, listed: ReadonlySet<string>): readonly DefaultField[] {
  const { data: schema } = useClassSchema(classHash === "" ? null : classHash);
  return useMemo(() => unwrittenOf(schema?.fields, listed), [schema, listed]);
}

function unwrittenOf(
  fields: readonly FieldSchema[] | undefined,
  listed: ReadonlySet<string>,
): readonly DefaultField[] {
  if (fields === undefined) return [];
  return unauthoredFields(fields, listed).filter((field) => field.hash !== FORCE_FIELD);
}

/** The hashes a master node lists, whose Add menus leave them out. */
function useListed(item: MasterItem | null): ReadonlySet<string> {
  const groups = item?.groups;
  const render = item?.render;
  const geometry = item?.geometry;
  return useMemo(
    () =>
      new Set([
        ...(groups ?? []).flatMap((each) => each.fields.map((field) => field.hash)),
        ...(render?.fields.map((field) => field.hash) ?? []),
        ...(geometry?.fields.map((field) => field.hash) ?? []),
      ]),
    [groups, render, geometry],
  );
}

/** A choice per field, which shows it on `master` at its default until an edit writes it. */
function useFieldChoices(
  master: string,
  fields: readonly DefaultField[],
): (group: EmitterGroup) => AddChoice[] {
  const addField = use(GraphActionsContext)?.addField;
  return (group) =>
    fields
      .filter((field) => masterGroup(field.hash) === group)
      .map((field) => ({
        key: field.hash,
        text: emitterLabel(field.hash, field.name) ?? field.name,
        pick: () => addField?.(master, field.hash),
      }));
}

/** A choice per force kind, each appending one force to the emitter at its game defaults. */
function useForceChoices(item: MasterItem | null): AddChoice[] {
  const entry = use(GraphActionsContext)?.entry ?? "";
  const editProperty = use(LeafEditContext)?.editProperty;
  if (item === null || editProperty === undefined || entry === "") return [];

  const holder = holderRow(entry, item.wire);
  return FORCE_DEFINITIONS.map((definition) => ({
    key: definition.kind,
    text: definition.title(),
    pick: () => void editProperty(holder, FORCE_COLLECTION, addForceEdits(definition)),
  }));
}

/**
 * Every Add of the master node `item` as one list for the quick add: each group's unwritten
 * fields, then the forces. A pick on a folded node unfolds it, so the field shows.
 */
export function useQuickFieldSections(item: MasterItem | null): readonly AddSection[] {
  const actions = use(GraphActionsContext);
  const unwritten = useUnwritten(item?.classHash ?? "", useListed(item));
  const choicesOf = useFieldChoices(item?.id ?? "", unwritten);
  const forces = useForceChoices(item);
  if (item === null) return [];

  const unfold = (choice: AddChoice): AddChoice => ({
    ...choice,
    pick: () => {
      if (actions?.collapsed.has(item.id) === true) actions.toggleCollapsed(item.id);
      choice.pick();
    },
  });
  return [
    ...GROUP_ORDER.map((group) => ({
      title: groupTitle(group),
      choices: choicesOf(group).map(unfold),
    })),
    { title: m.workshop_bin_forces_title(), choices: forces.map(unfold) },
  ];
}

/** A section header's Add: the group's unwritten fields, and on the forces' group the forces. */
export function GroupAdd({ item, group }: { item: MasterItem; group: EmitterGroup }) {
  const unwritten = useUnwritten(item.classHash, useListed(item));
  const choicesOf = useFieldChoices(item.id, unwritten);
  const forces = useForceChoices(item);

  const sections: AddSection[] = [{ title: groupTitle(group), choices: choicesOf(group) }];
  if (group === FORCE_GROUP)
    sections.unshift({ title: m.workshop_bin_forces_title(), choices: forces });
  return <AddMenu label={m.workshop_bin_graph_add_field_action()} sections={sections} />;
}

/** An emitter header's Add: a submenu per group the emitter writes nothing of yet. */
export function EmitterAdd({ item }: { item: MasterItem }) {
  const unwritten = useUnwritten(item.classHash, useListed(item));
  const choicesOf = useFieldChoices(item.id, unwritten);
  const present = new Set(item.groups.map((each) => each.group));

  const sections = GROUP_ORDER.filter(
    (group) => !present.has(group) && componentOf(group) === null,
  ).map((group) => ({ title: groupTitle(group), choices: choicesOf(group) }));
  return <AddMenu label={m.workshop_bin_graph_add_field_action()} sections={sections} />;
}

/** A component node header's Add: the fields of its group the emitter does not write. */
export function RenderAdd({ item }: { item: RenderItem }) {
  const listed = useMemo(() => new Set(item.fields.map((field) => field.hash)), [item.fields]);
  const unwritten = useUnwritten(item.classHash, listed);
  const choicesOf = useFieldChoices(item.master, unwritten);
  const group = COMPONENT_GROUP[item.role];

  return (
    <AddMenu
      label={m.workshop_bin_graph_add_field_action()}
      sections={[{ title: groupTitle(group), choices: choicesOf(group) }]}
    />
  );
}
