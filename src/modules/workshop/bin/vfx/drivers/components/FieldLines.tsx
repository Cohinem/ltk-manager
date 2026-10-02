import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Handle, Position } from "@xyflow/react";
import { type CSSProperties, type ReactNode, use, useMemo, useState } from "react";

import { InputDefaultContext, OVERLINE } from "@/components";
import { m } from "@/i18n";
import type { BinRow, ClassChoice } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { AlsoCheck, FieldRow } from "../../../classes/components/ClassCells";
import { binQueries } from "../../../documents/hooks/useBinDocument";
import { useBinRead } from "../../../documents/hooks/useBinRead";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { type RowFold, RowFoldContext } from "../../../tree/state/rowFold";
import { rowKey } from "../../../tree/utils/binRows";
import {
  useValueMark,
  useValueMarks,
  ValueMarksContext,
} from "../../../values/hooks/useValueMarks";
import type { CurveRead } from "../../../values/utils/valueRows";
import { COLUMN_STYLE } from "../../inspector/components/EmitterInspector";
import {
  type HeldClass,
  heldPrimitive,
  PrimitivePicker,
  usePrimitivePick,
} from "../../inspector/components/PrimitivePicker";
import { PRIMITIVE_FIELD } from "../../inspector/utils/primitives";
import { LINE_HEIGHT } from "../utils/driverLayout";
export { holderRow } from "../utils/holderRow";
import type { InputItem, ListEntry } from "../utils/graphItems";
import { inputSummary } from "../utils/nodeText";
import { useRowPathDrop } from "./assetDrops";
import { EmptySocket } from "./EmptySocket";
import { GraphActionsContext, NO_DOCUMENT, RowMenuContext } from "./graphActions";
import { SOCKET, socketFill } from "./GraphNodes";
import { LinePicker } from "./LinePicker";
import { ROWS_NEAR_ONLY } from "./NodeFrame";

/** The name column every line of a master or struct node shares with `FieldRow`. */
export const NAME_COLUMN = "w-(--name-width)";

/** `FIELD_PADDING` above and below a node's rows. */
export const FIELD_PAD = "py-1";

const FIELD_STYLE = { ...COLUMN_STYLE, "--name-width": "9rem" } as CSSProperties;

/* A struct is a node of its own, so no row of a node body opens in place. */
const NO_FOLD: RowFold = { isOpen: () => false, toggle: () => undefined };

/* Read with no request under it, so the id is never sent. */
/** The rows of the struct or list at `wire`, by path, and null until the read answers. */
export function useRowsAt(wire: string, count: number): ReadonlyMap<string, BinRow> | null {
  const actions = use(GraphActionsContext);
  const key = actions === null || actions.entry === "" ? null : `${actions.entry}:${wire}`;
  const requests = useMemo(() => (key === null ? [] : [{ key, rows: count }]), [key, count]);
  const pages = useBinRead(actions?.document ?? NO_DOCUMENT, requests);
  const page = key === null ? undefined : pages.get(key);

  return useMemo(
    () => (page === undefined ? null : new Map(page.rows.map((row) => [row.path, row]))),
    [page],
  );
}

/**
 * The body of a master, struct or curve node, which reads the curve marks of its rows.
 *
 * A node reads deeper than the view does, so its rows join the link checks here, or a path
 * the view never read draws as missing.
 */
export function FieldBody({
  wire,
  rows,
  read = "bands",
  nameWidth,
  children,
}: {
  /** The node's wire path, which keys its rows' link checks apart from the view's own. */
  wire: string;
  rows: readonly BinRow[];
  read?: CurveRead;
  /** The name column in pixels, where the node measures its own, else the inspector's. */
  nameWidth?: number;
  children: ReactNode;
}) {
  const actions = use(GraphActionsContext);
  const style = useMemo(
    () =>
      nameWidth === undefined
        ? FIELD_STYLE
        : ({ ...FIELD_STYLE, "--name-width": `${nameWidth}px` } as CSSProperties),
    [nameWidth],
  );
  const group = useMemo(() => ({ key: `graph:${wire}`, rows }), [wire, rows]);

  return (
    <div className={twMerge("nodrag flex min-w-0 flex-col", ROWS_NEAR_ONLY)} style={style}>
      <AlsoCheck document={actions?.document ?? NO_DOCUMENT} group={group}>
        <RowFoldContext value={NO_FOLD}>
          <RowMarks rows={rows} read={read}>
            {children}
          </RowMarks>
        </RowFoldContext>
      </AlsoCheck>
    </div>
  );
}

/** The curve marks of `rows` read as `read`, over the marks the surface already holds. */
export function RowMarks({
  rows,
  read,
  children,
}: {
  rows: readonly BinRow[];
  read: CurveRead;
  children: ReactNode;
}) {
  const actions = use(GraphActionsContext);
  const marks = useValueMarks(actions?.document ?? NO_DOCUMENT, rows, read);
  const held = use(ValueMarksContext);
  const merged = useMemo(
    () => (marks.size === 0 ? held : new Map([...held, ...marks])),
    [held, marks],
  );

  return <ValueMarksContext value={merged}>{children}</ValueMarksContext>;
}

/** One line of a node body, `LINE_HEIGHT` tall, which a socket's handle sits on the edge of. */
export function Line({
  className,
  style,
  farFace = false,
  menu,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  /** The line draws its own face under `FAR_ZOOM`, so the body's fade leaves it. */
  farFace?: boolean;
  /** The field row the line draws, which a right click offers the menu's row actions on. */
  menu?: { row: BinRow; owner: string | null };
  children: ReactNode;
}) {
  const report = use(RowMenuContext);
  const mark = useValueMark(menu === undefined ? undefined : rowKey(menu.row));
  const drop = useRowPathDrop(menu?.row);

  return (
    <div
      ref={drop.ref}
      data-far-face={farFace || undefined}
      data-asset-drop={drop.target || undefined}
      onContextMenu={
        menu === undefined || report === null
          ? undefined
          : () => report({ ...menu, curve: mark?.curve === true })
      }
      className={twMerge(
        "relative flex shrink-0 items-center data-asset-over:bg-accent-500/20",
        className,
      )}
      style={{ ...style, height: LINE_HEIGHT }}
    >
      {children}
    </div>
  );
}

/** A field the node edits in place, drawn by the inspector's own row. */
export function FieldLine({
  row,
  label,
  owner,
}: {
  row: BinRow;
  label?: string;
  owner: string | null;
}) {
  return (
    <Line menu={{ row, owner }}>
      <EmptySocket row={row} label={label ?? row.name} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <FieldRow row={row} label={label} tableLayout width={NAME_COLUMN} owner={owner} />
      </div>
    </Line>
  );
}

/** A field whose row has not been read, or that the schema does not know. */
export function NoteLine({ label }: { label: string }) {
  return (
    <Line>
      <span className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-500")}>
        {label}
      </span>
    </Line>
  );
}

/** A list a material holds: its row with its count, and a line per item under it. */
export function EntryLines({
  id,
  label,
  entries,
  open,
}: {
  /** The id the list folds under, which the caret toggles. */
  id: string;
  label: string;
  entries: readonly ListEntry[];
  open: boolean;
}) {
  const actions = use(GraphActionsContext);
  const Caret = open ? CaretDownIcon : CaretRightIcon;

  return (
    <>
      <Line>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => actions?.toggleCollapsed(id)}
          /* DS-HOVER */
          className={twMerge(
            NAME_COLUMN,
            "nodrag ml-1 flex shrink-0 cursor-pointer items-center gap-0.5 truncate text-surface-500 hover:text-surface-200",
          )}
        >
          <Caret weight="bold" className="size-3 shrink-0" />
          <span className="truncate">{`${label} [${entries.length}]`}</span>
        </button>
      </Line>
      {open && entries.map((entry, index) => <EntryLine key={index} entry={entry} />)}
    </>
  );
}

/** One item of a list a material holds: its name under the list's row, and its values. */
function EntryLine({ entry }: { entry: ListEntry }) {
  return (
    <Line>
      <span
        className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate pl-3 text-surface-300")}
        title={entry.key}
      >
        {entry.key}
      </span>
      <span
        className="min-w-0 flex-1 truncate border-l border-surface-700/40 pl-2 text-meta text-surface-400"
        title={entry.text}
      >
        {entry.text}
      </span>
    </Line>
  );
}

/** A group heading of a master node, as the inspector's section header writes it, and its Add. */
export function GroupLine({ title, add }: { title: string; add?: ReactNode }) {
  return (
    <Line className="border-t border-surface-700/40 pr-1 first:border-t-0">
      <span className={twMerge(OVERLINE, "px-2 font-sans")}>{title}</span>
      {add}
    </Line>
  );
}

/** The field a folded struct sits in, which heads its section of a struct node, and its action. */
export function SectionLine({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Line className="mt-0.5 border-t border-surface-700/40 pr-1">
      <span className="px-2 text-surface-300">{title}</span>
      {action}
    </Line>
  );
}

/** A field another node draws, with the input its edge ends at and a summary of that node. */
export function SocketLine({ input, label }: { input: InputItem; label: string }) {
  const kind = input.type === "value" ? input.kind : null;

  return (
    <Line>
      <Handle
        type="target"
        position={Position.Left}
        id={input.id}
        isConnectable={false}
        isConnectableStart={false}
        isConnectableEnd={false}
        className={twMerge(SOCKET, socketFill(kind))}
      />
      <span className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-200")}>
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate border-l border-surface-700/40 pl-2 text-meta text-surface-400">
        {inputSummary(input)}
      </span>
    </Line>
  );
}

interface ClassLineProps {
  label: string;
  /** The struct holding the pointer, and the pointer's field. A null field changes no class. */
  holder: BinRow;
  field: string | null;
  /** The wire path of the pointer, which the class choices are read at. */
  path: string;
  current: string | null;
}

/** A pointer's class, and the picker that replaces it with another the pointer can hold. */
export function ClassLine({ label, holder, field, path, current }: ClassLineProps) {
  const actions = use(GraphActionsContext);
  const editProperty = use(LeafEditContext)?.editProperty;
  const [asked, setAsked] = useState(false);
  const classes = useQuery({
    ...binQueries.itemClasses(actions?.document ?? NO_DOCUMENT, actions?.entry ?? "", path),
    enabled: asked && actions !== null,
  });
  const choices = (classes.data ?? []).filter((each) => each.hash !== current);

  const pick = (choice: ClassChoice) => {
    if (field === null || editProperty === undefined) return;
    void editProperty(holder, field, [{ type: "replacePointer", path: "", class: choice.hash }]);
  };

  return (
    <Line>
      <span className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-400")}>
        {label}
      </span>
      <div className="min-w-0 flex-1 border-l border-surface-700/40 pl-1">
        <LinePicker
          label={current ?? m.workshop_bin_graph_choose_class_action()}
          items={choices}
          itemKey={(choice) => choice.hash}
          itemText={(choice) => choice.name ?? choice.hash}
          onPick={pick}
          onOpen={() => setAsked(true)}
          disabled={field === null || editProperty === undefined}
        />
      </div>
    </Line>
  );
}

/** An emitter's primitive class, picked from the inspector's select of primitive classes. */
export function PrimitiveLine({
  label,
  holder,
  held,
}: {
  label: string;
  /** The emitter holding the primitive. */
  holder: BinRow;
  /** The class the file holds, and null for an emitter that leaves the primitive out. */
  held: HeldClass | null;
}) {
  const { known, text } = heldPrimitive(held);
  const pick = usePrimitivePick(holder, PRIMITIVE_FIELD, held);

  return (
    <Line>
      <span className={twMerge(NAME_COLUMN, "ml-5.5 shrink-0 truncate text-surface-400")}>
        {label}
      </span>
      <div className="min-w-0 flex-1 border-l border-surface-700/40 pl-1">
        <InputDefaultContext value={held === null}>
          <PrimitivePicker held={held} known={known} text={text} label={label} onPick={pick} />
        </InputDefaultContext>
      </div>
    </Line>
  );
}
