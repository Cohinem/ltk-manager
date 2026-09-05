import { CaretRightIcon, CubeIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";

import { Switch, Tooltip } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AppError, BinRow, BinValue, PropertyKind } from "@/lib/tauri";

import { canExpand, type VisibleRow } from "./binRows";

/** One line, which is what sizes the virtualizer. A matrix opened in place grows past it. */
export const ROW_HEIGHT = 24;

/** One level of depth, in px. */
const INDENT = 16;

/** Past this depth the indentation stops and the guides stack. */
const MAX_INDENT_DEPTH = 8;

/** The kinds a value alone does not say, drawn as a tag beside it. */
const TAGGED_KINDS: ReadonlySet<PropertyKind> = new Set([
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "f32",
]);

const AXES = ["x", "y", "z", "w"] as const;
const CHANNELS = ["r", "g", "b", "a"] as const;

interface RowLineProps {
  line: Extract<VisibleRow, { kind: "row" }>;
  /** The reveal landed on this row. */
  focused: boolean;
  /** The fetch of the rows under this one failed. */
  error?: AppError;
  onToggle: (key: string) => void;
}

/** One node of the bin: its name, its kind where the name does not say it, and its value. */
export function BinRowLine({ line, focused, error, onToggle }: RowLineProps) {
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
      <NameCell row={row} />
      <ValueCell row={row} />
      {error && (
        <Tooltip content={errorSummary(error)}>
          <WarningCircleIcon className="h-3.5 w-3.5 shrink-0 text-warning-text" />
        </Tooltip>
      )}
    </div>
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

function NameCell({ row }: { row: BinRow }) {
  const object = row.node === "object";
  const mono = row.unnamed || row.node === "element" || row.node === "entry";

  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1.5",
        object ? "max-w-[60%]" : "w-72",
      )}
    >
      {object && <CubeIcon className="h-3.5 w-3.5 shrink-0 text-surface-400" />}
      <span
        className={twMerge(
          "truncate",
          object ? "font-medium text-surface-100" : "text-surface-200",
          mono && "font-mono text-code",
          row.node === "element" && "text-surface-400",
          row.unnamed && "text-surface-300",
        )}
      >
        {row.name}
      </span>
    </span>
  );
}

function ValueCell({ row }: { row: BinRow }) {
  const { value, kind } = row;
  const tag = kind !== null && (TAGGED_KINDS.has(kind) || value.type === "undrawn") ? kind : null;

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Value value={value} object={row.node === "object"} />
      {tag && <Tag>{tag}</Tag>}
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
      if (value.name === null) return <Hex>{value.hash}</Hex>;
      return <Data>{value.name}</Data>;
    case "wadChunkLink":
      if (value.path === null) return <Hex>{value.hash}</Hex>;
      return <Mono>{value.path}</Mono>;
    case "objectLink":
      if (value.name === null) return <Hex>{value.hash}</Hex>;
      return <Data>{value.name}</Data>;
    case "container":
      if (value.len === 0) return <Dim>{m.workshop_bin_empty_label()}</Dim>;
      return <Dim>{m.workshop_bin_items_label({ count: value.len })}</Dim>;
    case "map":
      return <MapValue value={value} />;
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

function MapValue({ value }: { value: Extract<BinValue, { type: "map" }> }) {
  const kinds = m.workshop_bin_map_kinds_label({ key: value.keyKind, value: value.valueKind });
  return (
    <>
      {value.len === 0 && <Dim>{m.workshop_bin_empty_label()}</Dim>}
      {value.len > 0 && <Dim>{m.workshop_bin_entries_label({ count: value.len })}</Dim>}
      <Tag>{kinds}</Tag>
    </>
  );
}

interface StructValueProps {
  value: Extract<BinValue, { type: "struct" }>;
  object: boolean;
}

function StructValue({ value, object }: StructValueProps) {
  return (
    <>
      {value.class === null && <Hex>{value.classHash}</Hex>}
      {value.class !== null && <Data className="text-surface-400">{value.class}</Data>}
      {object && <span className="ml-auto text-meta text-surface-400">{value.len}</span>}
    </>
  );
}

interface ComponentsProps {
  labels: readonly string[];
  values: readonly number[];
}

function Components({ labels, values }: ComponentsProps) {
  return (
    <span className="flex min-w-0 gap-3">
      {values.map((component, at) => (
        <span key={labels[at] ?? at} className="flex items-baseline gap-1">
          <Tag>{labels[at]}</Tag>
          <Mono>{String(component)}</Mono>
        </span>
      ))}
    </span>
  );
}

/** Sixteen cells, shut until asked for. A shut matrix is one line like every other row. */
function MatrixValue({ values }: { values: readonly number[] }) {
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

function Tag({ children }: { children: ReactNode }) {
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

function Hex({ children }: { children: ReactNode }) {
  return (
    <span className="truncate font-mono text-code text-surface-400 select-text">{children}</span>
  );
}
