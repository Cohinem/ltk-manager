import {
  ArrowSquareOutIcon,
  CaretRightIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { type MouseEvent as ReactMouseEvent, type ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";

import { SeverityGlyph, Switch, Tooltip } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError, BinRow, BinValue } from "@/lib/tauri";

import { ObjectGlyph } from "../components/ObjectGlyph";
import type { OpenIntent } from "../palette/types";
import { clickIntent } from "../state";
import { canExpand, fieldHash, type RowLine, type VisibleRow } from "./binRows";
import { ClassCard } from "./ClassCard";
import { DeclaredLine, FieldCard } from "./FieldCard";
import { rowTag } from "./kindTag";
import { FileChip, ObjectChip } from "./LinkChip";

/** One line, which is what sizes the virtualizer. A matrix opened in place grows past it. */
export const ROW_HEIGHT = 24;

/** One level of depth, in px. */
const INDENT = 16;

/** Past this depth the indentation stops and the guides stack. */
const MAX_INDENT_DEPTH = 8;

const AXES = ["x", "y", "z", "w"] as const;
const CHANNELS = ["r", "g", "b", "a"] as const;

interface RowLineProps {
  line: RowLine;
  /** The reveal landed on this row. */
  focused: boolean;
  /** The fetch of the rows under this one failed. */
  error?: AppError;
  onToggle: (key: string) => void;
  /** Open the object an object row declares. Absent where no row is an object. */
  onOpenObject?: (row: BinRow, intent: OpenIntent) => void;
}

/** One node of the bin: its name, its kind as a tag, and its value. */
export function BinRowLine({ line, focused, error, onToggle, onOpenObject }: RowLineProps) {
  const { row, depth, expanded, loading } = line;
  const expandable = canExpand(row);

  return (
    <div
      data-ui="BinDocument:row"
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      className={twMerge(
        /* DS-VEIL, DS-RADIUS */
        "group/row flex min-h-6 items-center gap-2 rounded-sm pr-2 text-row transition-colors duration-100 hover:bg-surface-veil",
        expandable && "cursor-pointer",
        focused && "bg-accent-500/15",
      )}
      onClick={() => expandable && onToggle(line.key)}
    >
      <Guides depth={depth} />
      <Caret expandable={expandable} expanded={expanded} loading={loading} />
      <NameCell line={line} />
      <ValueCell row={row} />
      {error && (
        <Tooltip content={errorSummary(error)}>
          <WarningCircleIcon className="h-3.5 w-3.5 shrink-0 text-warning-text" />
        </Tooltip>
      )}
      {row.node === "object" && onOpenObject && (
        <OpenObjectAction onOpen={(intent) => onOpenObject(row, intent)} />
      )}
    </div>
  );
}

/** The object row's hover action, opening its object tab. `Ctrl+click` opens it beside. */
function OpenObjectAction({ onOpen }: { onOpen: (intent: OpenIntent) => void }) {
  const label = m.workshop_bin_open_object_action();
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        /* DS-VEIL, DS-RADIUS */
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 opacity-0 group-hover/row:opacity-100 hover:bg-surface-veil hover:text-surface-200 focus-visible:opacity-100"
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onOpen(clickIntent(event));
        }}
      >
        <ArrowSquareOutIcon weight="bold" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

interface MoreRowProps {
  line: Extract<VisibleRow, { kind: "more" }>;
}

/** The line under a node whose rows have not all answered. */
export function MoreRow({ line }: MoreRowProps) {
  return (
    <div className="flex h-6 items-center gap-2 pr-2 text-meta text-surface-400">
      <Guides depth={line.depth} />
      <span className="w-3 shrink-0" />
      <SpinnerGapIcon className="h-3 w-3 animate-spin" />
      <span>{m.workshop_bin_more_label({ loaded: line.loaded, total: line.total })}</span>
    </div>
  );
}

/** One guide per open level, each under the caret of the level it belongs to. */
function Guides({ depth }: { depth: number }) {
  const indented = Math.min(depth, MAX_INDENT_DEPTH);
  const stacked = depth - indented;
  return (
    <span className="flex shrink-0 translate-x-[6px] self-stretch" aria-hidden>
      {Array.from({ length: indented }, (_, level) => (
        <span
          key={level}
          className="shrink-0 border-l border-surface-700/60"
          style={{ width: INDENT }}
        />
      ))}
      {Array.from({ length: stacked }, (_, level) => (
        <span key={`stacked-${level}`} className="w-0.5 shrink-0 border-l border-surface-700/60" />
      ))}
    </span>
  );
}

interface CaretProps {
  expandable: boolean;
  expanded: boolean;
  loading: boolean;
}

function Caret({ expandable, expanded, loading }: CaretProps) {
  return (
    <span className="flex h-4 w-3 shrink-0 items-center justify-center text-surface-400">
      {loading && <SpinnerGapIcon className="h-3 w-3 animate-spin" />}
      {!loading && expandable && (
        <CaretRightIcon weight="bold" className={twMerge("h-3 w-3", expanded && "rotate-90")} />
      )}
    </span>
  );
}

/** The row's name, and its tag after it. "The property row" in docs/ux/BIN_EDITOR.md. */
function NameCell({ line }: { line: RowLine }) {
  const { row, owner } = line;
  const object = row.node === "object";
  const property = row.node === "property";
  const mono = row.unnamed || row.node === "element" || row.node === "entry";
  const nameClasses = twMerge(
    "truncate",
    object ? "font-medium text-surface-100" : "text-surface-200",
    mono && "font-mono text-code",
    row.node === "element" && "text-surface-400",
    row.unnamed && "text-surface-300",
  );

  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5",
        object ? "max-w-[60%]" : "w-72",
      )}
    >
      {object && (
        <ObjectGlyph
          objectClass={row.value.type === "struct" ? row.value.class : null}
          className="h-3.5 w-3.5 shrink-0 text-surface-400"
        />
      )}
      {property && (
        <FieldCard
          classHash={owner}
          fieldHash={fieldHash(row.path)}
          name={row.name}
          unnamed={row.unnamed}
          declared={row.declared}
          triggerClassName={nameClasses}
        />
      )}
      {!property && <span className={nameClasses}>{row.name}</span>}
      {!object && <KindTag row={row} />}
    </span>
  );
}

/** The row's kind in ritobin's words, and the Problems mark where the schema declares another. */
function KindTag({ row }: { row: BinRow }) {
  const tag = rowTag(row);
  if (tag === null) return null;
  const mismatch = row.declared !== null && row.declared.mismatch;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {mismatch && (
        <span role="img" aria-label={m.workshop_bin_mismatch_label()} className="flex">
          <SeverityGlyph severity="warning" />
        </span>
      )}
      {row.node === "property" && (
        <Tooltip content={<DeclaredLine declared={row.declared} />}>
          <span className={TAG_CLASSES}>{tag}</span>
        </Tooltip>
      )}
      {row.node !== "property" && <span className={TAG_CLASSES}>{tag}</span>}
    </span>
  );
}

/* A plain span rather than a component: the tooltip's render prop spreads its handlers
   onto the element it is given. */
const TAG_CLASSES = "font-mono text-code text-surface-400";

function ValueCell({ row }: { row: BinRow }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Value value={row.value} object={row.node === "object"} />
    </span>
  );
}

interface ValueProps {
  value: BinValue;
  /** The row is an object, whose count sits at the trailing edge. */
  object: boolean;
}

function Value({ value, object }: ValueProps) {
  switch (value.type) {
    case "none":
      return <Dim>{m.workshop_bin_none_label()}</Dim>;
    case "bool":
      return <Switch checked={value.value} disabled className="pointer-events-none" />;
    case "integer":
      return <Mono>{value.text}</Mono>;
    case "float":
      return <Mono>{String(value.value)}</Mono>;
    case "vector":
      return <Components labels={AXES} values={value.values} />;
    case "matrix":
      return <MatrixValue values={value.values} />;
    case "color":
      return <ColorValue value={value} />;
    case "string":
      return <Data className="text-surface-100">{value.value}</Data>;
    case "hash":
      return <ObjectChip hash={value.hash} name={value.name} kind="hash" />;
    case "wadChunkLink":
      return <FileChip hash={value.hash} path={value.path} />;
    case "objectLink":
      return <ObjectChip hash={value.hash} name={value.name} kind="link" />;
    case "container":
      if (value.len === 0) return <Dim>{m.workshop_bin_empty_label()}</Dim>;
      return <Dim>{m.workshop_bin_items_label({ count: value.len })}</Dim>;
    case "map":
      if (value.len === 0) return <Dim>{m.workshop_bin_empty_label()}</Dim>;
      return <Dim>{m.workshop_bin_entries_label({ count: value.len })}</Dim>;
    case "struct":
      return <StructValue value={value} object={object} />;
    case "null":
      return <Dim>{m.workshop_bin_null_label()}</Dim>;
    case "optional":
      if (value.present) return <Dim>{m.workshop_bin_present_label()}</Dim>;
      return <Dim>{m.workshop_bin_absent_label()}</Dim>;
    case "undrawn":
      return <Dim>{m.workshop_bin_undrawn_label()}</Dim>;
  }
}

interface StructValueProps {
  value: Extract<BinValue, { type: "struct" }>;
  object: boolean;
}

function StructValue({ value, object }: StructValueProps) {
  return (
    <>
      <ClassCard classHash={value.classHash} name={value.class} />
      {object && <span className="ml-auto text-meta text-surface-400">{value.len}</span>}
    </>
  );
}

interface ComponentsProps {
  labels: readonly string[];
  /** A component is `null` for a float JSON cannot carry: a NaN or an infinity. */
  values: readonly (number | null)[];
}

function Components({ labels, values }: ComponentsProps) {
  return (
    <span className="flex min-w-0 gap-3">
      {values.map((component, at) => (
        <span key={labels[at] ?? at} className="flex items-baseline gap-1">
          <ComponentLabel>{labels[at]}</ComponentLabel>
          <Mono>{String(component)}</Mono>
        </span>
      ))}
    </span>
  );
}

/** Sixteen cells, shut until asked for. A shut matrix is one line like every other row. */
function MatrixValue({ values }: { values: readonly (number | null)[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1 text-surface-400 hover:text-surface-200"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <CaretRightIcon weight="bold" className="h-3 w-3" />
        <span>{m.workshop_bin_matrix_label()}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="my-1 grid cursor-pointer grid-cols-4 gap-x-3 gap-y-0.5 text-left"
      onClick={(event) => {
        event.stopPropagation();
        setOpen(false);
      }}
    >
      {values.map((cell, at) => (
        <Mono key={at}>{String(cell)}</Mono>
      ))}
    </button>
  );
}

function ColorValue({ value }: { value: Extract<BinValue, { type: "color" }> }) {
  const { r, g, b, a } = value;
  return (
    <span className="flex min-w-0 items-center gap-3">
      {/* DS-TOKEN: the swatch is the value. */}
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-surface-veil-strong"
        style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
        aria-hidden
      />
      <Components labels={CHANNELS} values={[r, g, b, a]} />
    </span>
  );
}

function Dim({ children }: { children: ReactNode }) {
  return <span className="text-surface-400">{children}</span>;
}

function ComponentLabel({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-meta text-surface-400">{children}</span>;
}

function Data({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={twMerge("truncate text-surface-200 select-text", className)}>{children}</span>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="truncate font-mono text-code text-surface-200 select-text">{children}</span>
  );
}
