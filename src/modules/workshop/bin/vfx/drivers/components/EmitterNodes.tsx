import {
  BracketsCurlyIcon,
  CubeIcon,
  type Icon,
  ListBulletsIcon,
  SparkleIcon,
  SphereIcon,
} from "@phosphor-icons/react";
import { type NodeProps, Position } from "@xyflow/react";
import { Fragment, use, useMemo } from "react";

import type { BinRow, FieldSchema } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useClassSchema } from "../../../classes/hooks/useClassSchema";
import { DefaultProperty } from "../../inspector/components/DefaultProperty";
import type { HeldClass } from "../../inspector/components/PrimitivePicker";
import { defaultField } from "../../inspector/utils/emitterGroups";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { PRIMITIVE_FIELD } from "../../inspector/utils/primitives";
import { VfxRunContext } from "../../playback/state/run";
import { isMaterial, isPrimitive, shapePreviewed } from "../utils/driverLayout";
import { listId } from "../utils/entryLists";
import { emitterOf } from "../utils/graphEmitter";
import type { MasterField, MasterItem, StructItem, StructRow } from "../utils/graphItems";
import { listAppend } from "../utils/nodeEdits";
import { fieldAlias, groupTitle, inputSummary, itemSubtitle, itemTitle } from "../utils/nodeText";
import { outputTop } from "../utils/outputSocket";
import { componentInput, componentOf, drawnInSection } from "../utils/renderSection";
import { embeddedLists, embeddedValues, embedsList } from "../utils/socketEmbed";
import { ClassAction } from "./ClassAction";
import { EmitterRunToggles, useRunPresence } from "./EmitterRunToggles";
import { EmitterToggle } from "./EmitterToggle";
import {
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
import { type MasterFlowNode, NodeHeader, Output, type StructFlowNode } from "./GraphNodes";
import { EmitterAdd, GroupAdd } from "./MasterAdd";
import { MaterialShape } from "./MaterialShape";
import { EMBED_TONE, hueStyle, NodeFrame } from "./NodeFrame";
import { PrimitiveSketch } from "./NodePreviews";
import { useCardFollowsPick } from "./paneSync";
import { ShapeInViewButton } from "./ShapeOverlay";
import { EmbedBackButton, PopOutButton } from "./SocketEmbed";
import { ShapePreview } from "./SpawnPreview";
import { AddItemLine } from "./StructureLines";
import { EmitterSurface, StructPicture } from "./SurfacePreview";
import { ValueLine } from "./ValueLine";

/**
 * A complex or simple emitter: its written fields under the inspector's group headings, with
 * an input per keyed value or struct. It opens folded to its header and preview. Decision
 * 2.9 of docs/plans/shimmer-driver-graph.md.
 */
export function MasterNodeView({ data, selected }: NodeProps<MasterFlowNode>) {
  const { item, width, height, frame, nameWidth } = data.placed;
  const folded = use(GraphActionsContext)?.collapsed.has(item.id) ?? false;
  const presence = useRunPresence(item.simple, item.listIndex);
  useCardFollowsPick(item);

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={frame === undefined ? "above" : "none"}
      dim={item.disabled || presence?.hidden === true}
      dropTarget
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
        narrow
        extra={
          <>
            <EmitterAdd item={item} />
            <EmitterRunToggles presence={presence} />
            <EmitterToggle wire={item.wire} disabled={item.disabled} />
          </>
        }
      />
      <EmitterSurface simple={item.simple} listIndex={item.listIndex} />
      {!folded && (
        <div className={FIELD_PAD}>
          <MasterBody item={item} nameWidth={nameWidth} />
        </div>
      )}
      <Output kind={null} side={Position.Top} />
    </NodeFrame>
  );
}

function MasterBody({ item, nameWidth }: { item: MasterItem; nameWidth?: number }) {
  const actions = use(GraphActionsContext);
  const entry = actions?.entry ?? "";
  const rows = useRowsAt(item.wire, item.rowCount);
  const { data: schema } = useClassSchema(item.classHash === "" ? null : item.classHash);
  const holder = useMemo(() => holderRow(entry, item.wire), [entry, item.wire]);
  const embedded = useMemo(() => embeddedValues(item), [item]);
  const lists = useMemo(() => embeddedLists(item), [item]);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  return (
    <FieldBody wire={item.wire} rows={shown} nameWidth={nameWidth}>
      {item.groups.map((group) => (
        <Fragment key={group.group}>
          <GroupLine
            title={groupTitle(group.group)}
            add={componentOf(group.group) === null && <GroupAdd item={item} group={group.group} />}
          />
          {componentInput(item, group.group) !== null && (
            <SocketLine
              input={componentInput(item, group.group)!}
              label={groupTitle(group.group)}
            />
          )}
          {group.fields.map((field) => (
            <MasterLine
              key={field.hash}
              field={field}
              row={rows?.get(`${item.wire}.${field.hash.slice(2)}`)}
              holder={holder}
              schema={schema?.fields}
              owner={item.classHash}
              embedded={embedded}
              lists={lists}
              nameWidth={nameWidth}
            />
          ))}
        </Fragment>
      ))}
    </FieldBody>
  );
}

export interface MasterLineProps {
  field: MasterField;
  row: BinRow | undefined;
  holder: BinRow;
  schema: readonly FieldSchema[] | undefined;
  owner: string;
  embedded: ReadonlySet<string>;
  /** The lists embedded in the node's sockets, by port. */
  lists?: ReadonlyMap<string, StructItem>;
  /** The node's name column in pixels, which a struct drawn inside the line shares. */
  nameWidth?: number;
}

/** One field of a master or Texture node: an input, an unwritten field at its default, or its row. */
export function MasterLine({
  field,
  row,
  holder,
  schema,
  owner,
  embedded,
  lists,
  nameWidth,
}: MasterLineProps) {
  const declared = schema?.find((each) => each.hash === field.hash);
  const name = row?.name ?? declared?.name ?? field.hash;
  const label = emitterLabel(field.hash, name) ?? name;

  if (field.forces !== undefined) {
    return field.forces.map((force) => (
      <SocketLine key={force.id} input={force} label={force.label} />
    ));
  }
  if (field.input?.type === "value" && embedded.has(field.input.id)) {
    return <ValueLine item={field.input} row={row} label={label} owner={owner} />;
  }
  if (field.input?.type === "file" && drawnInSection(field.hash, field.input)) {
    if (row === undefined) return <NoteLine label={label} />;
    return <FieldLine row={row} label={label} owner={owner} />;
  }
  const list = field.input === null ? undefined : lists?.get(field.input.id);
  if (list !== undefined) return <EmbeddedList list={list} label={label} nameWidth={nameWidth} />;
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
  const { item, width, height, nameWidth } = data.placed;
  const material = isMaterial(item);
  const folded = (use(GraphActionsContext)?.collapsed.has(item.id) ?? false) && material;
  const previewed = shapePreviewed(item);
  const primitive = isPrimitive(item);
  const picture = previewed || primitive || material ? null : item.picture;

  return (
    <NodeFrame
      width={width}
      height={height}
      selected={selected}
      item={item}
      plate={previewed || primitive || material || picture !== null ? "none" : "inside"}
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
        divided
        extra={
          <>
            {previewed && <ShapeInViewButton id={item.id} />}
            {embedsList(item) && <EmbedBackButton id={item.id} />}
            <ClassAction item={item} />
          </>
        }
      />
      {previewed && <SpawnShape id={item.id} />}
      {primitive && <PrimitiveSketch id={item.id} held={heldOf(item)} />}
      {material && <MaterialShape material={item.material} />}
      {picture !== null && <StructPicture item={item} picture={picture} />}
      {!folded && (
        <div className={FIELD_PAD}>
          <StructBody
            item={item}
            nameWidth={nameWidth}
            embedded={embeddedValues(item)}
            lists={embeddedLists(item)}
          />
        </div>
      )}
      <Output kind={null} top={outputTop(item)} />
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

export function StructBody({
  item,
  nameWidth,
  embedded,
  lists = NO_LISTS,
}: {
  item: StructItem;
  /** The name column in pixels, and the master's own where the struct draws inside one. */
  nameWidth?: number;
  /** The ports of the node's struct a keyed value is embedded in, its section's included. */
  embedded: ReadonlySet<string>;
  /** The lists embedded in the node's sockets, by port, its section's included. */
  lists?: ReadonlyMap<string, StructItem>;
}) {
  const rows = useRowsAt(item.wire, item.rows.length);
  const shown = useMemo(() => (rows === null ? [] : [...rows.values()]), [rows]);

  return (
    <>
      <FieldBody wire={item.wire} rows={shown} nameWidth={nameWidth}>
        {item.rows.map((each, index) => (
          <StructLine
            key={each.key}
            each={each}
            row={rowOf(item, each, index, shown, rows)}
            owner={item.classHash}
            embedded={embedded}
            lists={lists}
            nameWidth={nameWidth}
            list={listId(item, each)}
          />
        ))}
        {listAppend(item) !== null && <AddItemLine item={item} />}
      </FieldBody>
      {item.nested !== null && (
        <>
          <SectionLine
            title={fieldAlias(item.nested.label, item.nested.field)}
            action={<ClassAction item={item.nested} />}
          />
          <StructBody item={item.nested} nameWidth={nameWidth} embedded={embedded} lists={lists} />
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
  embedded,
  lists,
  nameWidth,
  list,
}: {
  each: StructRow;
  row: BinRow | undefined;
  owner: string | null;
  embedded: ReadonlySet<string>;
  lists: ReadonlyMap<string, StructItem>;
  nameWidth?: number;
  /** The id the row's entries fold under, where it has any. */
  list: string;
}) {
  const name = row?.name ?? each.name;
  const label = fieldAlias(name, each.key.startsWith("0x") ? each.key : null);

  if (each.input?.type === "value" && embedded.has(each.input.id)) {
    return <ValueLine item={each.input} row={row} label={label} owner={owner} />;
  }
  const embeddedList = each.input === null ? undefined : lists.get(each.input.id);
  if (embeddedList !== undefined) {
    return <EmbeddedList list={embeddedList} label={label} nameWidth={nameWidth} />;
  }
  if (each.input !== null) return <SocketLine input={each.input} label={label} />;
  if (each.entries !== null) {
    return (
      <EntryLines id={list} label={label} entries={each.entries} open={each.listOpen === true} />
    );
  }
  if (row === undefined) return <NoteLine label={label} />;
  return <FieldLine row={row} label={label} owner={owner} />;
}

const NO_LISTS: ReadonlyMap<string, StructItem> = new Map();

/**
 * A short list drawn in the socket it feeds, in its node's hue: its name and count with the
 * button that pops it out to a node, over its items' rows, each edited in place.
 */
function EmbeddedList({
  list,
  label,
  nameWidth,
}: {
  list: StructItem;
  label: string;
  nameWidth?: number;
}) {
  return (
    <div className={EMBED_TONE} style={hueStyle(list)}>
      <Line>
        <span className={twMerge(NAME_COLUMN, "ml-5 shrink-0 truncate text-surface-200")}>
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate pl-2 text-meta text-surface-400">
          {inputSummary(list)}
        </span>
        <PopOutButton id={list.id} />
      </Line>
      <StructBody item={list} nameWidth={nameWidth} embedded={embeddedValues(list)} />
    </div>
  );
}
