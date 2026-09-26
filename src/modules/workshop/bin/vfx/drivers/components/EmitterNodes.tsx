import {
  BracketsCurlyIcon,
  CubeIcon,
  DiceFiveIcon,
  type Icon,
  ListBulletsIcon,
  SparkleIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";
import { type NodeProps, Position } from "@xyflow/react";
import { Fragment, use, useMemo } from "react";

import { m } from "@/i18n";
import type { BinRow, FieldSchema } from "@/lib/tauri";

import { ValueCell } from "../../../classes/components/ClassCells";
import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { DefaultProperty } from "../../inspector/components/DefaultProperty";
import {
  type DefaultField,
  defaultField,
  fieldGroup,
  GROUP_TITLE,
  unauthoredFields,
} from "../../inspector/utils/emitterGroups";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { VfxRunContext } from "../../playback/state/run";
import { stripShape } from "../utils/curveShape";
import { LINE_HEIGHT, shapePreviewed, STRIP_LINES, structNameWidth } from "../utils/driverLayout";
import { emitterOf } from "../utils/graphEmitter";
import type {
  MasterField,
  MasterItem,
  StructItem,
  StructRow,
  ValueItem,
} from "../utils/graphItems";
import { KIND_TONE } from "../utils/graphTones";
import { itemSubtitle, itemTitle, valueSummary } from "../utils/nodeText";
import { EmitterPreview } from "./EmitterPreview";
import { EmitterToggle } from "./EmitterToggle";
import {
  AddFieldLine,
  ClassLine,
  FieldBody,
  FieldLine,
  GroupLine,
  holderRow,
  Line,
  NAME_COLUMN,
  NoteLine,
  SectionLine,
  SocketLine,
  useRowsAt,
} from "./FieldLines";
import { GraphActionsContext } from "./graphActions";
import {
  type MasterFlowNode,
  NodeHeader,
  Output,
  type StructFlowNode,
  type ValueFlowNode,
} from "./GraphNodes";
import { NodeFrame } from "./NodeFrame";
import { FilePreview, ShapePreview } from "./NodePreviews";
import { MarkedCurve } from "./PlateFace";

/**
 * A complex or simple emitter: its written fields under the inspector's group headings, with
 * an input per keyed value or struct. It opens folded to its header and preview. Decision
 * 2.9 of docs/plans/shimmer-driver-graph.md.
 */
export function MasterNodeView({ data, selected }: NodeProps<MasterFlowNode>) {
  const { item, width, height } = data.placed;
  const folded = use(GraphActionsContext)?.collapsed.has(item.id) ?? false;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate="above"
      dim={item.disabled}
    >
      <NodeHeader
        icon={SparkleIcon}
        iconTone="text-accent-400"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        folds
        extra={<EmitterToggle wire={item.wire} disabled={item.disabled} />}
      />
      <EmitterPreview simple={item.simple} listIndex={item.listIndex} />
      {!folded && <MasterBody item={item} />}
      <Output kind={null} side={Position.Top} />
    </NodeFrame>
  );
}

function MasterBody({ item }: { item: MasterItem }) {
  const actions = use(GraphActionsContext);
  const entry = actions?.entry ?? "";
  const rows = useRowsAt(item.wire, item.rowCount);
  const { data: schema } = useClassSchema(item.classHash === "" ? null : item.classHash);
  const holder = useMemo(() => holderRow(entry, item.wire), [entry, item.wire]);
  const listed = useMemo(
    () => new Set(item.groups.flatMap((each) => each.fields.map((field) => field.hash))),
    [item.groups],
  );
  const unwritten = useMemo(
    () => (schema == null ? [] : unauthoredFields(schema.fields, listed)),
    [schema, listed],
  );
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);
  const present = new Set(item.groups.map((each) => each.group));
  const add = (field: DefaultField) => actions?.addField(item.id, field.hash);

  return (
    <FieldBody wire={item.wire} rows={shown}>
      {item.groups.map((group) => (
        <Fragment key={group.group}>
          <GroupLine title={GROUP_TITLE[group.group]()} />
          {group.fields.map((field) => (
            <MasterLine
              key={field.hash}
              field={field}
              row={rows?.get(`${item.wire}.${field.hash.slice(2)}`)}
              holder={holder}
              schema={schema?.fields}
              owner={item.classHash}
            />
          ))}
          <AddFieldLine
            fields={unwritten.filter((field) => fieldGroup(field.hash) === group.group)}
            onPick={add}
          />
        </Fragment>
      ))}
      <AddFieldLine
        fields={unwritten.filter((field) => !present.has(fieldGroup(field.hash)))}
        onPick={add}
      />
    </FieldBody>
  );
}

interface MasterLineProps {
  field: MasterField;
  row: BinRow | undefined;
  holder: BinRow;
  schema: readonly FieldSchema[] | undefined;
  owner: string;
}

/** One field of a master node: an input, an unwritten field at its default, or its row. */
function MasterLine({ field, row, holder, schema, owner }: MasterLineProps) {
  const declared = schema?.find((each) => each.hash === field.hash);
  const name = row?.name ?? declared?.name ?? field.hash;
  const label = emitterLabel(field.hash, name) ?? name;

  if (field.input !== null) return <SocketLine input={field.input} label={label} />;
  if (field.pending && declared?.declared?.kind === "pointer") {
    return (
      <ClassLine
        label={label}
        holder={holder}
        field={field.hash}
        path={`${holder.path}.${field.hash.slice(2)}`}
        current={null}
      />
    );
  }
  if (field.pending && declared !== undefined) {
    return (
      <Line>
        <div className="min-w-0 flex-1 overflow-hidden">
          <DefaultProperty
            field={defaultField(declared)}
            holder={holder}
            width={NAME_COLUMN}
            owner={owner}
          />
        </div>
      </Line>
    );
  }
  if (row === undefined) return <NoteLine label={label} />;
  return <FieldLine row={row} label={label} owner={owner} />;
}

/**
 * A struct, pointer, list or map an emitter writes: its class, and its fields or items. A
 * spawn shape draws itself in 3D over its fields, and a struct holding a file draws the file's
 * preview. A struct folded into it draws as a section under its own rows.
 */
export function StructNodeView({ data, selected }: NodeProps<StructFlowNode>) {
  const { item, width, height } = data.placed;
  const previewed = shapePreviewed(item);
  const picture = previewed ? null : item.picture;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={previewed || picture !== null ? "none" : "inside"}
    >
      <NodeHeader
        icon={STRUCT_ICON[item.shape]}
        iconTone="text-bin-class-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
      />
      {previewed && <SpawnShape id={item.id} />}
      {picture !== null && <FilePreview item={picture} />}
      <StructBody item={item} nameWidth={structNameWidth(item)} />
      <Output kind={null} />
    </NodeFrame>
  );
}

/** The spawn shape of the emitter the node sits under, as the run's model of it reads. */
function SpawnShape({ id }: { id: string }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, id), [system, id]);
  return <ShapePreview emitter={emitter} />;
}

const STRUCT_ICON: Readonly<Record<StructItem["shape"], Icon>> = {
  struct: CubeIcon,
  list: ListBulletsIcon,
  map: BracketsCurlyIcon,
};

function StructBody({ item, nameWidth }: { item: StructItem; nameWidth: number }) {
  const actions = use(GraphActionsContext);
  const entry = actions?.entry ?? "";
  const rows = useRowsAt(item.wire, item.rows.length);
  const holder = useMemo(() => holderRow(entry, item.holder), [entry, item.holder]);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  return (
    <>
      <FieldBody wire={item.wire} rows={shown} nameWidth={nameWidth}>
        {item.shape === "struct" && (
          <ClassLine
            label={m.workshop_bin_class_label()}
            holder={holder}
            field={item.field}
            path={item.wire}
            current={item.className ?? item.classHash}
          />
        )}
        {item.rows.map((each, index) => (
          <StructLine
            key={each.key}
            each={each}
            row={rowOf(item, each, index, shown, rows)}
            owner={item.classHash}
          />
        ))}
      </FieldBody>
      {item.nested !== null && (
        <>
          <SectionLine title={item.nested.label} />
          <StructBody item={item.nested} nameWidth={nameWidth} />
        </>
      )}
    </>
  );
}

/** The row a struct node's line reads: a field by its path, an item or an entry by its place. */
function rowOf(
  item: StructItem,
  each: StructRow,
  index: number,
  shown: readonly BinRow[],
  rows: ReadonlyMap<string, BinRow> | null,
): BinRow | undefined {
  if (item.shape === "struct") return rows?.get(`${item.wire}.${each.key.slice(2)}`);
  return rows?.get(`${item.wire}${each.key}`) ?? shown[index];
}

function StructLine({
  each,
  row,
  owner,
}: {
  each: StructRow;
  row: BinRow | undefined;
  owner: string | null;
}) {
  const label = row?.name ?? each.key;

  if (each.input !== null) return <SocketLine input={each.input} label={label} />;
  if (row === undefined) return <NoteLine label={label} />;
  return <FieldLine row={row} owner={owner} />;
}

/** A keyed or randomised value: its row, which opens the curve panel, over its summary. */
export function ValueNodeView({ data, selected }: NodeProps<ValueFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <NodeHeader
        icon={item.curve.keys.length > 0 ? WaveSineIcon : DiceFiveIcon}
        iconTone={item.kind === null ? "text-bin-class-text" : KIND_TONE[item.kind].text}
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        kind={item.kind ?? undefined}
        wire={item.wire}
      />
      <ValueBody item={item} />
      <Output kind={item.kind} />
    </NodeFrame>
  );
}

/**
 * A value node's editor over its shape and its summary. The socket it feeds names the field,
 * so the editor takes the node's whole width.
 */
function ValueBody({ item }: { item: ValueItem }) {
  const rows = useRowsAt(item.holder, item.holderRows);
  const row = rows?.get(item.wire);
  const shown = useMemo(() => (row === undefined ? [] : [row]), [row]);
  const shape = stripShape(item);

  return (
    <FieldBody wire={item.wire} rows={shown} read="curves">
      {row === undefined && <NoteLine label={item.label} />}
      {row !== undefined && (
        <Line className="px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <ValueCell row={row} shaped />
          </div>
        </Line>
      )}
      {shape !== null && <CurveStrip item={item} shape={shape} />}
      {shape === null && (
        <Line>
          <span className="ml-2 truncate text-meta text-surface-400">{valueSummary(item)}</span>
        </Line>
      )}
    </FieldBody>
  );
}

/** A value's curve or its random tables drawn under its editor, its key count in the corner. */
function CurveStrip({ item, shape }: { item: ValueItem; shape: "keys" | "tables" }) {
  return (
    <div
      /* DS-GROUND, DS-VEIL, DS-RADIUS */
      className="relative mx-2 mt-1 shrink-0 rounded-md border border-surface-veil bg-surface-950/40 px-2 pt-4 pb-2"
      style={{ height: STRIP_LINES * LINE_HEIGHT - 8 }}
    >
      <MarkedCurve item={item} shape={shape} />
      <span className="absolute top-0.5 right-1.5 text-fine text-surface-400">
        {valueSummary(item)}
      </span>
    </div>
  );
}
