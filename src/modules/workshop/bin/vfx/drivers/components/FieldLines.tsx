import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Handle, Position } from "@xyflow/react";
import { type CSSProperties, type ReactNode, use, useMemo, useState } from "react";

import { m } from "@/i18n";
import type { BinDocumentId, BinRow, ClassChoice } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { AlsoCheck, FieldRow } from "../../../classes/components/ClassCells";
import { binQueries } from "../../../documents/hooks/useBinDocument";
import { useBinRead } from "../../../documents/hooks/useBinRead";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { type RowFold, RowFoldContext } from "../../../tree/state/rowFold";
import { useValueMarks, ValueMarksContext } from "../../../values/hooks/useValueMarks";
import type { CurveRead } from "../../../values/utils/valueRows";
import { COLUMN_STYLE } from "../../inspector/components/EmitterInspector";
import type { DefaultField } from "../../inspector/utils/emitterGroups";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { LINE_HEIGHT } from "../utils/driverLayout";
export { holderRow } from "../utils/holderRow";
import type { InputItem } from "../utils/graphItems";
import { inputSummary } from "../utils/nodeText";
import { GraphActionsContext } from "./graphActions";
import { SOCKET, socketFill } from "./GraphNodes";
import { LinePicker } from "./LinePicker";
import { NEAR_ONLY } from "./NodeFrame";

/** The name column every line of a master or struct node shares with `FieldRow`. */
export const NAME_COLUMN = "w-(--name-width)";

const FIELD_STYLE = { ...COLUMN_STYLE, "--name-width": "9rem" } as CSSProperties;

/* A struct is a node of its own, so no row of a node body opens in place. */
const NO_FOLD: RowFold = { isOpen: () => false, toggle: () => undefined };

/* Read with no request under it, so the id is never sent. */
const NO_DOCUMENT = 0 as BinDocumentId;

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
  const marks = useValueMarks(actions?.document ?? NO_DOCUMENT, rows, read);
  const held = use(ValueMarksContext);
  const merged = useMemo(() => new Map([...held, ...marks]), [held, marks]);
  const style = useMemo(
    () =>
      nameWidth === undefined
        ? FIELD_STYLE
        : ({ ...FIELD_STYLE, "--name-width": `${nameWidth}px` } as CSSProperties),
    [nameWidth],
  );
  const group = useMemo(() => ({ key: `graph:${wire}`, rows }), [wire, rows]);

  return (
    <div className={twMerge("nodrag flex min-w-0 flex-col", NEAR_ONLY)} style={style}>
      <AlsoCheck document={actions?.document ?? NO_DOCUMENT} group={group}>
        <RowFoldContext value={NO_FOLD}>
          <ValueMarksContext value={merged}>{children}</ValueMarksContext>
        </RowFoldContext>
      </AlsoCheck>
    </div>
  );
}

/** One line of a node body, `LINE_HEIGHT` tall, which a socket's handle sits on the edge of. */
export function Line({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={twMerge("relative flex shrink-0 items-center", className)}
      style={{ height: LINE_HEIGHT }}
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
    <Line>
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
      <span
        className={twMerge(
          NAME_COLUMN,
          "ml-5.5 shrink-0 truncate font-mono text-code text-surface-500",
        )}
      >
        {label}
      </span>
    </Line>
  );
}

/** A group heading of a master node, as the inspector's section header writes it. */
export function GroupLine({ title }: { title: string }) {
  return (
    <Line className="border-t border-surface-700/40 first:border-t-0">
      <span className="px-2 font-sans text-xs font-medium tracking-wide text-surface-400 uppercase">
        {title}
      </span>
    </Line>
  );
}

/** The field a folded struct sits in, which heads its section of a struct node. */
export function SectionLine({ title }: { title: string }) {
  return (
    <Line className="mt-0.5 border-t border-surface-700/40">
      <span className="px-2 font-mono text-code text-surface-300">{title}</span>
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
        className={twMerge(SOCKET, socketFill(kind))}
      />
      <span
        className={twMerge(
          NAME_COLUMN,
          "ml-5.5 shrink-0 truncate font-mono text-code text-surface-200",
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate border-l border-surface-700/40 pl-2 font-mono text-meta text-surface-400">
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
      <span
        className={twMerge(
          NAME_COLUMN,
          "ml-5.5 shrink-0 truncate font-mono text-code text-surface-400",
        )}
      >
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

/** The picker that shows a field the file does not write yet on its node. */
export function AddFieldLine({
  fields,
  onPick,
}: {
  fields: readonly DefaultField[];
  onPick: (field: DefaultField) => void;
}) {
  const editable = use(LeafEditContext) !== null;

  return (
    <Line>
      <PlusIcon weight="bold" className="ml-2 h-3 w-3 shrink-0 text-surface-400" />
      <div className="min-w-0 flex-1 pr-1">
        <LinePicker
          label={m.workshop_bin_graph_add_field_action()}
          items={fields}
          itemKey={(field) => field.hash}
          itemText={(field) => emitterLabel(field.hash, field.name) ?? field.name}
          onPick={onPick}
          disabled={!editable || fields.length === 0}
        />
      </div>
    </Line>
  );
}
