import { TrashIcon } from "@phosphor-icons/react";
import { type ReactNode, use, useEffect, useMemo, useRef } from "react";

import { IconButton, Inline, InputDefaultContext, Stack } from "@/components";
import { m } from "@/i18n";
import type { BinRow, JointTreeGroup } from "@/lib/tauri";
import { CHAIN_PARAMETERS, type ChainParameter, scaledValue } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { CurveToggle, FieldRow } from "../../classes/components/ClassCells";
import { useDeclares } from "../../documents/hooks/useDeclared";
import { BinEditContext } from "../../tree/hooks/useBinEdit";
import { type LeafEdit, LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { fieldHash, rowKey } from "../../tree/utils/binRows";
import { RowValue } from "../../values/components/RowValue";
import { absentRow, type FieldSlot } from "../../vfx/inspector/components/StructFields";
import { parseDefault } from "../../vfx/inspector/utils/defaultValue";
import { defaultField } from "../../vfx/inspector/utils/emitterGroups";
import { sendDynamics, useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { useItems } from "../hooks/useDynamicsRows";
import { SkinTintContext } from "../state/skinTint";
import { NO_SHAPES } from "../utils/colliders";
import { parameterCurveEdits, removeEdits, setLeafEdits, under } from "../utils/dynamicsEdits";
import {
  CHAIN_PROPERTIES,
  FIELD,
  JOINT_TREES,
  PARAMETER_FIELD,
  SCALED_CLASS,
  TREE_GROUPS,
} from "../utils/dynamicsFields";
import { chainProperties, jointLabel, type WireChain } from "../utils/dynamicsModel";
import { ColliderList } from "./ColliderList";
import { Fields, Marks, usePhysicsScope, ValueSlot } from "./PhysicsCells";

/** The parameter each field of `DynamicsChainProperties` is, by the field's hash. */
const PARAMETER_OF: ReadonlyMap<string, ChainParameter> = new Map(
  CHAIN_PARAMETERS.map((parameter) => [PARAMETER_FIELD[parameter], parameter] as const),
);

/** The parameters only rod physics reads. */
const ROD: ReadonlySet<ChainParameter> = new Set(["rodBend", "rodTwist", "rodStretch", "rodShear"]);

/** The points a parameter's sparkline is drawn through. */
const SPARK_POINTS = 16;

export interface ChainFieldsProps {
  /** The chain's own row. */
  readonly row: BinRow;
  readonly chain: WireChain;
}

/** A dynamics chain: its own fields, the colliders of the file it names, and its groups. */
export function ChainFields({ row, chain }: ChainFieldsProps) {
  const { shapes } = usePhysicsScope();
  const special = ({ field, child }: FieldSlot) => {
    if (field.hash !== TREE_GROUPS) return undefined;

    return (
      <div className="flex flex-col gap-1.5 pt-1.5 font-sans">
        <ColliderList chain={chain} file={shapes.get(chain.path) ?? NO_SHAPES} />
        <Groups list={child} chain={chain} />
      </div>
    );
  };

  return <Fields row={row} special={special} />;
}

interface GroupsProps {
  /** The chain's `JointTreeGroups`, and undefined for a chain that holds none. */
  readonly list: BinRow | undefined;
  readonly chain: WireChain;
}

function Groups({ list, chain }: GroupsProps) {
  const rows = useItems(usePhysicsScope().document, list);

  return (
    <>
      {rows.map((row, at) => {
        const group = chain.groups.find((each) => each.path === row.path);
        if (group === undefined) return null;

        return <GroupFields key={row.path} row={row} group={group} index={at} />;
      })}
    </>
  );
}

interface GroupFieldsProps {
  readonly row: BinRow;
  readonly group: JointTreeGroup;
  readonly index: number;
}

/**
 * One group of a chain: its trees, its own fields, and its chain properties, each
 * parameter of which is one row.
 */
function GroupFields({ row, group, index }: GroupFieldsProps) {
  const send = useDynamicsEdit(row.entry);
  const special = (slot: FieldSlot) => {
    if (slot.field.hash === JOINT_TREES) {
      return <Trees list={slot.child} group={group} />;
    }

    const parameter = PARAMETER_OF.get(slot.field.hash);
    if (parameter === undefined || slot.field.classHash !== SCALED_CLASS) return undefined;

    /* A rod parameter the file leaves out is not offered while rod physics is off. */
    const unread = ROD.has(parameter) && !group.properties.useRodPhysics;
    if (unread && slot.child === undefined) return null;

    return <ScaledRow slot={slot} group={group} parameter={parameter} />;
  };

  return (
    <div
      data-ui="ChainFields:group"
      className="flex flex-col gap-1.5 border-t border-surface-700/40 pt-1.5 font-sans"
    >
      <Inline gap={1.5} justify="between">
        <span className="text-meta font-medium text-surface-200 select-none">
          {m.workshop_bin_physics_group_title({ index: index + 1 })}
        </span>
        {send !== null && (
          <IconButton
            size="row"
            icon={<TrashIcon />}
            label={m.workshop_bin_physics_remove_action()}
            onClick={() => send(removeEdits(group.path))}
          />
        )}
      </Inline>
      <Marks path={group.path} />
      <Fields row={row} special={special} />
    </div>
  );
}

interface TreesProps {
  /** The group's `JointTrees`, and undefined for a group that holds none. */
  readonly list: BinRow | undefined;
  readonly group: JointTreeGroup;
}

/** The trees of a group, each named by the joint it is rooted on over its own fields. */
function Trees({ list, group }: TreesProps) {
  const rows = useItems(usePhysicsScope().document, list);

  return (
    <>
      {rows.map((row) => (
        <Tree key={row.path} row={row} group={group} />
      ))}
    </>
  );
}

function Tree({ row, group }: { row: BinRow; group: JointTreeGroup }) {
  const { pose } = usePhysicsScope();
  const send = useDynamicsEdit(row.entry);
  const tree = group.trees.find((each) => each.path === row.path);
  const excluded = tree?.excluded.length ?? 0;

  return (
    <div data-ui="ChainFields:tree" className="pb-1 font-sans">
      <Stack gap={0.5}>
        <Inline gap={1.5} justify="between">
          <Inline as="span" gap={1.5} fill>
            <span className="shrink-0 text-meta text-surface-400 select-none">
              {m.workshop_bin_physics_tree_label()}
            </span>
            <span className="min-w-0 truncate font-mono text-code text-surface-200 select-text">
              {jointLabel(pose, tree?.root ?? null) ?? "-"}
            </span>
            {excluded > 0 && (
              <span className="shrink-0 text-meta text-surface-400 select-none">
                {m.workshop_bin_physics_tree_excluded_label({ count: excluded })}
              </span>
            )}
          </Inline>
          {send !== null && (
            <IconButton
              size="row"
              icon={<TrashIcon />}
              label={m.workshop_bin_physics_remove_action()}
              onClick={() => send(removeEdits(row.path))}
            />
          )}
        </Inline>
        <Marks path={row.path} />
        <Fields row={row} depth={1} />
      </Stack>
    </div>
  );
}

/** The `value` a parameter's class default holds, and zero for a default that states none. */
function defaultOf(json: string | null): number {
  const held = parseDefault(json);
  if (typeof held !== "object" || held === null) return 0;

  const { value } = held as { value?: unknown };
  return typeof value === "number" ? value : 0;
}

interface ScaledRowProps {
  readonly slot: FieldSlot;
  readonly group: JointTreeGroup;
  readonly parameter: ChainParameter;
}

/**
 * One chain parameter on one row: its value, the shape of the curve that scales it from
 * the root on the left to the tip on the right, and whether the curve is used.
 *
 * "A value family in a layout" in docs/ux/BIN_EDITOR.md, for a holder the curve dock does
 * not take.
 */
function ScaledRow({ slot, group, parameter }: ScaledRowProps) {
  const { field, child, holder, within, owner, width, depth } = slot;
  const edit = use(LeafEditContext);
  const send = useDynamicsEdit(holder.entry);
  const wire = group.properties[parameter];
  const curved = wire.useCurve && wire.curve !== null;

  const tint = use(SkinTintContext);
  const setTinted = tint?.setTinted;
  const tinted = tint?.tinted?.group === group.path && tint.tinted.parameter === parameter;
  /* A row that leaves the pane while it holds the tint takes the tint with it. */
  const holds = useRef(tinted);
  holds.current = tinted;
  useEffect(
    () => () => {
      if (holds.current) setTinted?.(null);
    },
    [setTinted],
  );

  const row =
    child ??
    absentRow(
      within === undefined ? holder : absentRow(holder, within, { type: "null" }),
      defaultField(field),
      { type: "struct", classHash: SCALED_CLASS, class: null, len: 0 },
    );
  /* The typed read answers the class default for a value the file leaves out, so the
     file's own row is what says the value is written. */
  const written = useItems(usePhysicsScope().document, child).find(
    (each) => fieldHash(each.path) === FIELD.value,
  );
  const value: BinRow = written ?? {
    entry: row.entry,
    path: under(row.path, FIELD.value),
    label: `${row.label}.value`,
    node: "property",
    name: "value",
    unnamed: false,
    kind: "f32",
    declared: {
      shape: { kind: "f32", key: null, value: null },
      mismatch: false,
    },
    value: {
      type: "float",
      value: wire.value ?? defaultOf(field.defaultValue),
    },
  };
  const at = rowKey(value);

  /* The value is written from the deepest struct the file holds, so the embeds it leaves
     out on the way are added by the one edit and a declaration says no more than them. */
  const declares = useDeclares();
  const from = child?.path ?? (within === undefined ? holder.path : group.path);
  const fields = useMemo(() => {
    if (child !== undefined) return [FIELD.value];
    if (within === undefined) return [field.hash, FIELD.value];
    return [CHAIN_PROPERTIES, field.hash, FIELD.value];
  }, [child, within, field.hash]);
  const scoped = useMemo<LeafEdit | null>(() => {
    if (written !== undefined) return edit;

    const sends = edit?.send;
    const landed = edit?.landed;
    if (edit === null || sends === undefined || landed === undefined) return null;

    return {
      refused: edit.refused,
      dismiss: () => edit.mark?.(at, null),
      commit: async (_row, typed) => {
        if (!typed.ok) {
          edit.mark?.(at, {
            code: "BIN_EDIT_REJECTED",
            address: at,
            rejection: typed.rejection,
          });
          return false;
        }

        const refused = await sendDynamics(
          { send: sends, landed },
          row.entry,
          declares,
          setLeafEdits(from, fields, typed.leaf),
        );
        edit.mark?.(at, refused);

        return refused === null;
      },
    };
  }, [edit, declares, written, at, row.entry, from, fields]);

  const curve = (on: boolean) => {
    if (on !== curved) send?.(parameterCurveEdits(group.path, parameter, on, wire.curve !== null));
  };

  return (
    <div
      data-ui="ChainFields:parameter"
      /* DS-RADIUS */
      className={twMerge("flex flex-col rounded-sm", tinted && "bg-accent-500/10")}
      onPointerEnter={() => setTinted?.({ group: group.path, parameter })}
      onPointerLeave={() => tinted && setTinted?.(null)}
    >
      <InputDefaultContext value={child === undefined}>
        <FieldRow
          row={row}
          tableLayout
          width={width}
          depth={depth}
          owner={owner}
          valueSlot={
            <ValueSlot>
              <InputDefaultContext value={written === undefined}>
                <Written held={written !== undefined} edit={scoped}>
                  <RowValue row={value} field={field.hash} />
                </Written>
              </InputDefaultContext>
              <Sparkline group={group} parameter={parameter} shown={curved} />
              {send !== null && (
                <CurveToggle
                  active={curved}
                  onConstant={() => curve(false)}
                  onCurve={() => curve(true)}
                />
              )}
            </ValueSlot>
          }
        />
      </InputDefaultContext>
      <Marks path={group.path} parameter={parameter} />
    </div>
  );
}

/**
 * The edit a parameter's value is sent through: the row's own where the file holds the
 * value, and `edit` where the value is written from the mesh properties down.
 */
function Written({
  held,
  edit,
  children,
}: {
  held: boolean;
  edit: LeafEdit | null;
  children: ReactNode;
}) {
  if (held) return children;

  return (
    <BinEditContext value={null}>
      <LeafEditContext value={edit}>{children}</LeafEditContext>
    </BinEditContext>
  );
}

/** What a curve scales its parameter by from the root to the tip, drawn as one line. */
function Sparkline({
  group,
  parameter,
  shown,
}: {
  group: JointTreeGroup;
  parameter: ChainParameter;
  /** The parameter uses a curve, and a row that uses none draws no line. */
  shown: boolean;
}) {
  const points = useMemo(() => {
    if (!shown) return "";

    const curve = { ...chainProperties(group.properties)[parameter], value: 1 };
    return Array.from({ length: SPARK_POINTS + 1 }, (_, at) => {
      const t = at / SPARK_POINTS;
      return `${(t * 46 + 1).toFixed(1)},${(13 - scaledValue(curve, t) * 12).toFixed(1)}`;
    }).join(" ");
  }, [group, parameter, shown]);

  if (!shown) return null;

  return (
    <svg aria-hidden viewBox="0 0 48 14" className="h-3.5 w-12 shrink-0 text-accent-300">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
