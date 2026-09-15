import { type ReactNode, use } from "react";

import { DataTable, type DataTableColumn, DataTableCells, DataTableHeaders } from "@/components";
import { NO_OVERSCROLL } from "@/hooks";
import { m } from "@/i18n";
import type { AnimationGraph, Mask } from "@/lib/tauri";
import { useSetPreviewDisplay } from "@/stores";
import { twMerge } from "@/utils";

import { None } from "../ClassCells";
import { FoldCaret } from "./ClipTable";
import { type ClipTab, SkinChoiceContext } from "./skinChoice";

/** One column of a sibling map's table. */
interface MapColumn<T> {
  readonly key: string;
  readonly label: () => string;
  readonly width: string;
  readonly draw: (row: T) => ReactNode;
}

/** The decimals a joint's weight is written to. */
const WEIGHT_DECIMALS = 2;

const NAME_COLUMN = { key: "name", label: m.workshop_bin_clip_column_name_label, width: "w-64" };

const TRACK_COLUMNS: readonly MapColumn<AnimationGraph["tracks"][number]>[] = [
  { ...NAME_COLUMN, draw: (row) => <MapName name={row.name} hash={row.hash} /> },
  {
    key: "priority",
    label: m.workshop_bin_clip_column_priority_label,
    width: "w-20",
    draw: (row) => <Num value={row.priority} />,
  },
  {
    key: "blendMode",
    label: m.workshop_bin_clip_column_blend_mode_label,
    width: "w-24",
    draw: (row) => <Num value={row.blendMode} />,
  },
  {
    key: "blendWeight",
    label: m.workshop_bin_clip_column_blend_weight_label,
    width: "w-24",
    draw: (row) => <Num value={row.blendWeight} />,
  },
];

const MASK_COLUMNS: readonly MapColumn<Mask>[] = [
  { ...NAME_COLUMN, draw: (row) => <MapName name={row.name} hash={row.hash} /> },
  {
    key: "id",
    label: m.workshop_bin_clip_column_id_label,
    width: "w-20",
    draw: (row) => <Num value={row.id} />,
  },
  {
    key: "joints",
    label: m.workshop_bin_clip_column_joints_label,
    width: "w-24",
    draw: (row) => (
      <span className="text-surface-300 tabular-nums">
        {m.workshop_bin_clip_joints_count_label({
          weighed: weighedJoints(row).length,
          total: row.weights.length,
        })}
      </span>
    ),
  },
];

const SYNC_GROUP_COLUMNS: readonly MapColumn<AnimationGraph["syncGroups"][number]>[] = [
  { ...NAME_COLUMN, draw: (row) => <MapName name={row.name} hash={row.hash} /> },
  {
    key: "kind",
    label: m.workshop_bin_clip_column_type_label,
    width: "w-20",
    draw: (row) => <Num value={row.kind} />,
  },
];

/** The slots of the joints a mask weighs at all. A float the file holds no number in weighs none. */
function weighedJoints(mask: Mask): number[] {
  return mask.weights.flatMap((weight, slot) => ((weight ?? 0) > 0 ? [slot] : []));
}

interface MapTableProps {
  readonly graph: AnimationGraph;
  readonly tab: Exclude<ClipTab, "clips">;
  /** The skeleton's joint names by slot, and null where the view reaches no skeleton. */
  readonly joints: readonly string[] | null;
}

/**
 * The rows of one sibling map, each with the struct's own fields as columns.
 *
 * "The clips pane" in docs/ux/BIN_EDITOR.md. A mask row unfolds to the joints it weighs,
 * and a click on it weighs the mask on the character and shows the armature it reads on.
 */
export function MapTable({ graph, tab, joints }: MapTableProps) {
  const choice = use(SkinChoiceContext);
  const setDisplay = useSetPreviewDisplay();
  switch (tab) {
    case "tracks":
      return <Rows tab={tab} rows={graph.tracks} columns={TRACK_COLUMNS} />;
    case "masks":
      return (
        <Rows
          tab={tab}
          rows={graph.masks}
          columns={MASK_COLUMNS}
          pressed={choice?.mask ?? null}
          onPick={(mask) => {
            if (choice === null) return;
            const weighing = choice.mask !== mask.hash;
            choice.setMask(weighing ? mask.hash : null);
            if (weighing) setDisplay({ previewArmature: true });
          }}
          detail={(mask) => <MaskJoints mask={mask} joints={joints} />}
        />
      );
    case "syncGroups":
      return <Rows tab={tab} rows={graph.syncGroups} columns={SYNC_GROUP_COLUMNS} />;
  }
}

interface RowsProps<T> {
  readonly tab: ClipTab;
  readonly rows: readonly T[];
  readonly columns: readonly MapColumn<T>[];
  /** The row a click holds down, by hash, where the rows are pressable. */
  readonly pressed?: string | null;
  readonly onPick?: (row: T) => void;
  /** What a row unfolds to, where the rows unfold. */
  readonly detail?: (row: T) => ReactNode;
}

/** A header and a row per entry, in map order, the one a chip jumped to marked and in view. */
function Rows<T extends { hash: string }>({
  tab,
  rows,
  columns,
  pressed = null,
  onPick,
  detail,
}: RowsProps<T>) {
  const choice = use(SkinChoiceContext);
  const marked = choice?.marked?.tab === tab ? choice.marked.hash : null;

  return (
    <DataTable
      ariaLabel={m.workshop_bin_clip_tabs_label()}
      options={{
        data: rows,
        getRowId: (row) => row.hash,
        enableSorting: false,
        columns: columns.map((column): DataTableColumn<T> => ({
          id: column.key,
          header: () => (
            <span className={twMerge("shrink-0 truncate", column.width)}>{column.label()}</span>
          ),
          cell: ({ row }) => (
            <span
              className={twMerge("flex shrink-0 items-center gap-2 overflow-hidden", column.width)}
            >
              {column.draw(row.original)}
            </span>
          ),
        })),
      }}
    >
      {(table) => (
        <div
          data-ui={`ClipTable:${tab}`}
          className="min-h-0 flex-1 overflow-auto p-1.5 font-mono text-mono-row scrollbar-md"
          {...NO_OVERSCROLL}
        >
          <div className="min-w-max">
            <div className="sticky top-0 z-10 flex gap-2 bg-surface-900 px-1.5 pb-0.5 font-sans text-meta text-surface-400 select-none">
              {detail !== undefined && <span className="w-4 shrink-0" />}
              <DataTableHeaders headers={table.getFlatHeaders()} customCells />
            </div>
            {rows.length === 0 && (
              <span className="px-1.5 text-meta text-surface-400">
                {m.workshop_bin_section_none_empty()}
              </span>
            )}
            {table.getRowModel().rows.map((tableRow) => {
              const row = tableRow.original;
              const expanded = detail !== undefined && (choice?.isExpanded(tab, row.hash) ?? false);
              return (
                <div
                  key={row.hash}
                  ref={(element) => {
                    if (marked === row.hash) element?.scrollIntoView?.({ block: "nearest" });
                  }}
                >
                  <div
                    role={onPick === undefined ? undefined : "button"}
                    tabIndex={onPick === undefined ? undefined : 0}
                    aria-pressed={onPick === undefined ? undefined : pressed === row.hash}
                    aria-expanded={detail === undefined ? undefined : expanded}
                    /* DS-VEIL, DS-RADIUS */
                    className={twMerge(
                      "flex min-h-6 items-center gap-2 rounded-sm px-1.5 hover:bg-surface-veil-soft",
                      onPick !== undefined && "cursor-pointer",
                      marked === row.hash && "bg-accent-500/10",
                      pressed === row.hash && "bg-accent-500/15",
                    )}
                    onClick={() => onPick?.(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPick?.(row);
                      }
                    }}
                  >
                    {detail !== undefined && (
                      <FoldCaret
                        expanded={expanded}
                        onToggle={() => choice?.toggleExpanded(tab, row.hash)}
                      />
                    )}
                    <DataTableCells row={tableRow} customCells />
                  </div>
                  {expanded && detail?.(row)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DataTable>
  );
}

/** The joints a mask weighs, each by slot and by the name the skeleton gives the slot. */
function MaskJoints({ mask, joints }: { mask: Mask; joints: readonly string[] | null }) {
  const weighed = weighedJoints(mask);
  if (weighed.length === 0) return <None />;

  const columns: DataTableColumn<{ slot: number }>[] = [
    {
      id: "slot",
      header: () => <span className="w-10 shrink-0">#</span>,
      cell: ({ row }) => (
        <span className="w-10 shrink-0 text-surface-400 tabular-nums">{row.original.slot}</span>
      ),
    },
    {
      id: "joint",
      header: () => (
        <span className="w-48 shrink-0">{m.workshop_bin_clip_column_joint_label()}</span>
      ),
      cell: ({ row }) => (
        <span className="w-48 min-w-0 shrink-0 truncate text-surface-200 select-text">
          {joints?.[row.original.slot] ?? ""}
        </span>
      ),
    },
    {
      id: "weight",
      header: () => (
        <span className="w-16 shrink-0">{m.workshop_bin_clip_column_weight_label()}</span>
      ),
      cell: ({ row }) => (
        <span className="w-16 shrink-0 text-surface-300 tabular-nums">
          {(mask.weights[row.original.slot] ?? 0).toFixed(WEIGHT_DECIMALS)}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      ariaLabel={m.workshop_bin_clip_column_joint_label()}
      options={{
        data: weighed.map((slot) => ({ slot })),
        columns,
        getRowId: (row) => String(row.slot),
        enableSorting: false,
      }}
    >
      {(table) => (
        <div data-ui="ClipTable:mask-joints" className="flex flex-col py-1 pl-5">
          <div className="flex gap-2 px-1.5 font-sans text-meta text-surface-400 select-none">
            <DataTableHeaders headers={table.getFlatHeaders()} customCells />
          </div>
          {table.getRowModel().rows.map((row) => (
            <div key={row.id} className="flex min-h-5 items-center gap-2 px-1.5">
              <DataTableCells row={row} customCells />
            </div>
          ))}
        </div>
      )}
    </DataTable>
  );
}

/** A map key's name, and its hex dimmed where no table names it. */
function MapName({ name, hash }: { name: string; hash: string }) {
  return (
    <span
      className={twMerge(
        "min-w-0 truncate select-text",
        name === hash ? "text-surface-400" : "text-surface-200",
      )}
    >
      {name}
    </span>
  );
}

/** A number of the struct, and a dash for a float the file holds no number in. */
function Num({ value }: { value: number | null }) {
  if (value === null) return <span className="text-surface-500">-</span>;
  return <span className="text-surface-300 tabular-nums">{value}</span>;
}
