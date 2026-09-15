import type { ReactNode } from "react";

import { DataTable, type DataTableColumn } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { Swatch } from "./ColorMark";
import { CHANNELS, CHIP } from "./curveChannels";
import { colorHex, type ColorStop, type CurveKey, type ValueFamily } from "./valueRows";

interface KeyTableProps {
  keys: readonly CurveKey[];
  family: ValueFamily;
  /** The key the host has picked, which draws as the selected row. */
  selected?: number;
  /** Picking a row, where the host has something to pick. Absent leaves the rows inert. */
  onSelect?: (at: number) => void;
}

/**
 * The keys as rows, a time and a channel per column. "The tabs" in
 * docs/ux/BIN_EDITOR.md.
 *
 * It is the form an edit takes, so it is the numbers themselves rather than a reading of
 * them: what a curve holds, in the order the file holds it. A host that picks keys of its
 * own hands the selection down, so its mark and this row are one choice.
 */
export function KeyTable({ keys, family, selected, onSelect }: KeyTableProps) {
  if (keys.length === 0) return <Empty />;

  const names = CHANNELS[family];
  const columns: DataTableColumn<CurveKey>[] = [
    {
      id: "time",
      header: () => <Head>{m.workshop_bin_curve_time_column()}</Head>,
      cell: ({ row }) => <Cell className="text-surface-400">{row.original.time.toFixed(3)}</Cell>,
    },
  ];
  if (family === "color")
    columns.push({
      id: "color",
      header: () => <Head />,
      cell: ({ row }) => (
        <td className="px-1.5 py-0.5">
          <ColorCell values={row.original.values} />
        </td>
      ),
    });
  columns.push(
    ...names.map((name, channel): DataTableColumn<CurveKey> => ({
      id: name,
      header: () => (
        <Head className={names.length > 1 ? (CHIP[channel] ?? CHIP[0]) : undefined}>{name}</Head>
      ),
      cell: ({ row }) => <Cell>{format(row.original.values[channel])}</Cell>,
    })),
  );
  return (
    <div
      data-ui="KeyTable"
      className="min-h-0 flex-1 overflow-auto font-mono text-code scrollbar-sm"
    >
      <DataTable
        ariaLabel={m.workshop_bin_random_keys_action()}
        options={{ data: keys, columns, enableSorting: false }}
        className="text-left text-code tabular-nums"
        headerClassName="sticky top-0 bg-surface-900 text-meta text-surface-400 select-none"
        customCells
        customHeaders
        rowProps={({ index }) => ({
          "aria-selected": onSelect === undefined ? undefined : index === selected,
          className: twMerge(
            "hover:bg-surface-veil-soft",
            onSelect !== undefined && "cursor-pointer",
            index === selected && onSelect !== undefined && "bg-surface-veil",
          ),
          onClick: onSelect === undefined ? undefined : () => onSelect(index),
        })}
      />
    </div>
  );
}

function Head({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={twMerge("px-1.5 py-0.5 font-normal", className)}>{children}</th>;
}

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={twMerge("px-1.5 py-0.5 text-surface-200 select-text", className)}>{children}</td>
  );
}

/** A colour key's own swatch, so a row is read as a colour and not as four numbers. */
function ColorCell({ values }: { values: readonly number[] }) {
  const [r, g, b, a] = values;
  if (r === undefined || g === undefined || b === undefined || a === undefined) return null;
  const rgba: ColorStop["rgba"] = [r, g, b, a];
  return (
    <span className="flex items-center gap-1.5">
      <Swatch rgba={rgba} className="h-3 w-3" />
      <span className="text-surface-400 select-text">{colorHex(rgba)}</span>
    </span>
  );
}

function Empty() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-meta text-surface-500">
      {m.workshop_bin_curve_keys_empty()}
    </div>
  );
}

/** A channel a key does not carry draws nothing, which a short row is. */
function format(value: number | undefined): string {
  return value === undefined ? "" : String(Number(value.toFixed(4)));
}
