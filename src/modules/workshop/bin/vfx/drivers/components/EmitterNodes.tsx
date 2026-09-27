import {
  BracketsCurlyIcon,
  CubeIcon,
  DiceFiveIcon,
  type Icon,
  ListBulletsIcon,
  SparkleIcon,
  SphereIcon,
  WaveSineIcon,
} from "@phosphor-icons/react";
import { type NodeProps, Position } from "@xyflow/react";
import { Fragment, use, useMemo } from "react";

import { m } from "@/i18n";
import type { BinRow, FieldSchema } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { ValueCell } from "../../../classes/components/ClassCells";
import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { DefaultProperty } from "../../inspector/components/DefaultProperty";
import type { HeldClass } from "../../inspector/components/PrimitivePicker";
import {
  type DefaultField,
  defaultField,
  fieldGroup,
  GROUP_TITLE,
  unauthoredFields,
} from "../../inspector/utils/emitterGroups";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { PRIMITIVE_FIELD } from "../../inspector/utils/primitives";
import { VfxRunContext } from "../../playback/state/run";
import { valueLines, valueShape } from "../utils/curveShape";
import {
  isMaterial,
  isPrimitive,
  LINE_HEIGHT,
  shapePreviewed,
  structNameWidth,
  VALUE_HEADER_HEIGHT,
} from "../utils/driverLayout";
import { emitterOf } from "../utils/graphEmitter";
import type {
  MasterField,
  MasterItem,
  StructItem,
  StructRow,
  ValueItem,
} from "../utils/graphItems";
import { KIND_NAME, KIND_TONE } from "../utils/graphTones";
import { fieldAlias, itemSubtitle, itemTitle, valueSummary } from "../utils/nodeText";
import { EmitterPreview } from "./EmitterPreview";
import { EmitterToggle } from "./EmitterToggle";
import {
  AddFieldLine,
  ClassLine,
  EntryLines,
  FIELD_PAD,
  FieldBody,
  FieldLine,
  GroupLine,
  holderRow,
  Line,
  NAME_COLUMN,
  NoteLine,
  PrimitiveLine,
  SectionLine,
  SocketLine,
  useRowsAt,
} from "./FieldLines";
import { GraphActionsContext } from "./graphActions";
import {
  type MasterFlowNode,
  NodeHeader,
  Output,
  RevealButton,
  type StructFlowNode,
  type ValueFlowNode,
} from "./GraphNodes";
import { NEAR_ONLY, NodeFrame } from "./NodeFrame";
import { FilePreview, PrimitiveSketch, ShapePreview } from "./NodePreviews";
import { useCardFollowsPick, useCurveFollowsPick } from "./paneSync";
import { CurvePicture, MarkedCurve } from "./PlateFace";

/**
 * A complex or simple emitter: its written fields under the inspector's group headings, with
 * an input per keyed value or struct. It opens folded to its header and preview. Decision
 * 2.9 of docs/plans/shimmer-driver-graph.md.
 */
export function MasterNodeView({ data, selected }: NodeProps<MasterFlowNode>) {
  const { item, width, height, frame } = data.placed;
  const folded = use(GraphActionsContext)?.collapsed.has(item.id) ?? false;
  useCardFollowsPick(item);

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={frame === undefined ? "above" : "none"}
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
      {!folded && (
        <div className={FIELD_PAD}>
          <MasterBody item={item} />
        </div>
      )}
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
  if (field.pending && field.hash === PRIMITIVE_FIELD) {
    return <PrimitiveLine label={label} holder={holder} held={null} />;
  }
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
 * spawn shape draws itself in 3D over its fields, a primitive draws the inspector's sketch, and
 * a struct holding a file draws the file's preview. A struct folded into it draws as a section
 * under its own rows. A material folds to its header, and draws each item of its lists as a
 * line under the list's row.
 */
export function StructNodeView({ data, selected }: NodeProps<StructFlowNode>) {
  const { item, width, height } = data.placed;
  const material = isMaterial(item);
  const folded = (use(GraphActionsContext)?.collapsed.has(item.id) ?? false) && material;
  const previewed = shapePreviewed(item);
  const primitive = isPrimitive(item);
  const picture = previewed || primitive || folded ? null : item.picture;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={previewed || primitive || picture !== null ? "none" : "inside"}
    >
      <NodeHeader
        icon={material ? SphereIcon : STRUCT_ICON[item.shape]}
        iconTone="text-bin-class-text"
        title={itemTitle(item)}
        subtitle={itemSubtitle(item)}
        id={item.id}
        wire={item.wire}
        inputs={item.ports.length}
        folds={material || item.ports.length > 0}
        divided={!folded}
      />
      {previewed && <SpawnShape id={item.id} />}
      {primitive && <PrimitiveSketch id={item.id} held={heldOf(item)} />}
      {picture !== null && <FilePreview item={picture} />}
      {!folded && (
        <div className={FIELD_PAD}>
          <StructBody item={item} nameWidth={structNameWidth(item)} />
        </div>
      )}
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

function heldOf(item: StructItem): HeldClass | null {
  return item.classHash === null ? null : { classHash: item.classHash, class: item.className };
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
        {isPrimitive(item) && (
          <PrimitiveLine label={m.workshop_bin_class_label()} holder={holder} held={heldOf(item)} />
        )}
        {item.shape === "struct" && !isPrimitive(item) && (
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
          <SectionLine title={fieldAlias(item.nested.label, item.nested.field)} />
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
  const name = row?.name ?? each.name;
  const label = fieldAlias(name, each.key.startsWith("0x") ? each.key : null);

  if (each.input !== null) return <SocketLine input={each.input} label={label} />;
  if (each.entries !== null) return <EntryLines label={label} entries={each.entries} />;
  if (row === undefined) return <NoteLine label={label} />;
  return <FieldLine row={row} label={label} owner={owner} />;
}

/**
 * A keyed or randomised value: its kind and summary over its curve, or over its row where it
 * has no curve to draw. The socket it feeds names the field, so the node names only its kind.
 */
export function ValueNodeView({ data, selected }: NodeProps<ValueFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <ValueHeader item={item} />
      <div className={FIELD_PAD}>
        <ValueBody item={item} />
      </div>
      <Output kind={item.kind} />
    </NodeFrame>
  );
}

function ValueHeader({ item }: { item: ValueItem }) {
  const actions = use(GraphActionsContext);
  const Glyph = item.curve.keys.length > 0 ? WaveSineIcon : DiceFiveIcon;
  const tone = item.kind === null ? "text-bin-class-text" : KIND_TONE[item.kind].text;
  const shape = valueShape(item);

  return (
    <div
      title={itemSubtitle(item)}
      className={twMerge(
        "flex shrink-0 items-center gap-1.5 rounded-t-[inherit] border-b border-surface-veil bg-linear-to-b from-(--node-wash) to-transparent px-2",
        NEAR_ONLY,
      )}
      style={{ height: VALUE_HEADER_HEIGHT }}
    >
      <Glyph weight="duotone" className={twMerge("h-4 w-4 shrink-0", tone)} />
      {item.kind !== null && (
        <span className={twMerge("shrink-0 font-mono text-meta", tone)}>
          {KIND_NAME[item.kind]}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-meta text-surface-400">
        {valueSummary(item)}
      </span>
      {shape === "tables" && (
        <span className={twMerge(CURVE_WELL, "h-5 w-28 shrink-0 px-1 py-0.5")}>
          <MarkedCurve item={item} shape={shape} />
        </span>
      )}
      {actions?.reveal && <RevealButton onReveal={() => actions.reveal?.(item.wire)} />}
    </div>
  );
}

/* DS-GROUND, DS-VEIL, DS-RADIUS */
const CURVE_WELL = "rounded-sm border border-surface-veil bg-surface-950/40";

/** A keyed value's curve or gradient beside its toggle, or any other value's editor. */
function ValueBody({ item }: { item: ValueItem }) {
  const rows = useRowsAt(item.holder, item.holderRows);
  const row = rows?.get(item.wire);
  const shown = useMemo(() => (row === undefined ? [] : [row]), [row]);
  useCurveFollowsPick(item.id, row);
  const shape = valueShape(item);
  const gradient = shape === "band" && item.curve.keys.length > 0;
  const keyed = shape === "keys" || gradient;

  return (
    <FieldBody wire={item.wire} rows={shown} read="curves">
      {row === undefined && <NoteLine label={fieldAlias(item.label)} />}
      {row !== undefined && keyed && (
        <div
          className="flex shrink-0 items-center gap-2 px-2"
          style={{ height: valueLines(item) * LINE_HEIGHT }}
        >
          <div className={twMerge(CURVE_WELL, "h-full min-w-0 flex-1 px-1.5 py-1")}>
            {gradient && <CurvePicture curve={item.curve} shape="band" />}
            {!gradient && <MarkedCurve item={item} shape="keys" />}
          </div>
          <div className="flex shrink-0 items-center">
            <ValueCell row={row} shaped controls />
          </div>
        </div>
      )}
      {row !== undefined && !keyed && (
        <Line className="px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <ValueCell row={row} shaped />
          </div>
        </Line>
      )}
    </FieldBody>
  );
}
