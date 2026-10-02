import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { DataTable, type DataTableColumn, Popover, Readout } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { CurveKey, ValueFamily } from "../../values/utils/valueRows";
import { type RandomEdit, useRandomEdit } from "../state/randomEdit";
import { channelName, chipOf } from "../utils/curveChannels";
import { type ChannelDraw, neverRolled } from "../utils/randomDraw";
import { tableKeys, withKey } from "../utils/randomEdits";
import { factorText, readout } from "../utils/randomText";

/** A random channel's keys, behind a button at the end of its row. */
export function KeysPopover({ channel, family }: { channel: ChannelDraw; family: ValueFamily }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        /* DS-RADIUS, DS-VEIL */
        className="flex h-5 cursor-pointer items-center gap-0.5 rounded-sm px-1 text-meta text-surface-400 select-none hover:bg-surface-veil hover:text-surface-200"
      >
        {m.workshop_bin_random_keys_action()}
        <CaretDownIcon weight="bold" className="size-3" />
      </Popover.Trigger>
      <Popover.Content side="bottom" align="end" className="flex flex-col gap-1.5 p-2 text-row">
        <Popover.Title className="flex items-baseline gap-1.5 text-meta font-normal text-surface-400">
          {family !== "scalar" && (
            <span
              /* DS-KIND-HUE, DS-TEXT */
              className={twMerge("font-mono font-semibold", chipOf(family, channel.channel))}
            >
              {channelName(family, channel.channel)}
            </span>
          )}
          {factorText(channel)}
        </Popover.Title>
        <ChanceTable channel={channel} />
      </Popover.Content>
    </Popover.Root>
  );
}

/**
 * A table's keys: the chance, the factor there, and the result where the base holds still.
 * Where the table can be written, the chance and the factor are fields.
 */
function ChanceTable({ channel }: { channel: ChannelDraw }) {
  const editor = useRandomEdit();
  const { table } = channel;
  if (table === null) return null;
  const base = channel.results === null ? null : channel.base;

  const factor = (key: CurveKey) => key.values[0] ?? table.single;
  const columns: DataTableColumn<CurveKey>[] = [
    {
      id: "chance",
      header: () => <Head>{m.workshop_bin_random_chance_column()}</Head>,
      cell: ({ row }) => (
        <KeyCell
          text={row.original.time.toFixed(3)}
          label={m.workshop_bin_random_chance_column()}
          editor={editor}
          onCommit={(value) =>
            write(editor, channel, row.index, { time: value, factor: factor(row.original) })
          }
        />
      ),
    },
    {
      id: "factor",
      header: () => <Head>{m.workshop_bin_random_factor_column()}</Head>,
      cell: ({ row }) => (
        <KeyCell
          text={readout(factor(row.original))}
          label={m.workshop_bin_random_factor_column()}
          editor={editor}
          onCommit={(value) =>
            write(editor, channel, row.index, { time: row.original.time, factor: value })
          }
        />
      ),
    },
  ];
  if (base !== null)
    columns.push({
      id: "result",
      header: () => <Head>{m.workshop_bin_random_result_column()}</Head>,
      cell: ({ row }) => <Cell>{readout(factor(row.original) * base)}</Cell>,
    });
  columns.push({
    id: "status",
    header: () => <Head />,
    cell: ({ row }) => (
      <td className="px-1.5 py-0.5 font-sans text-meta select-none">
        {neverRolled(row.original.time) && m.workshop_bin_random_never_rolled_label()}
      </td>
    ),
  });
  return (
    <DataTable
      ariaLabel={m.workshop_bin_random_keys_action()}
      options={{ data: table.keys, columns, enableSorting: false }}
      className="w-fit text-left font-mono text-code tabular-nums"
      headerClassName="text-meta text-surface-400 select-none"
      customCells
      customHeaders
      rowProps={({ original }) => ({
        className: twMerge(
          "text-surface-200 hover:bg-surface-veil-soft",
          neverRolled(original.time) && "text-surface-500",
        ),
      })}
    />
  );
}

function write(
  editor: RandomEdit | null,
  channel: ChannelDraw,
  at: number,
  key: { time: number; factor: number },
) {
  if (editor === null || channel.table === null) return;
  editor.write(channel, withKey(tableKeys(channel.table), at, key));
}

/** One number of a key, a field where the table can be written. */
function KeyCell({
  text,
  label,
  editor,
  onCommit,
}: {
  text: string;
  label: string;
  editor: RandomEdit | null;
  onCommit: (value: number) => void;
}) {
  if (editor === null) return <Cell>{text}</Cell>;

  return (
    <td className="px-1 py-0.5">
      <Readout
        value={text}
        aria-label={label}
        className="w-16 text-right"
        onCommit={(typed) => {
          const value = Number(typed);
          if (typed.trim() !== "" && Number.isFinite(value)) onCommit(value);
        }}
      />
    </td>
  );
}

function Head({ children }: { children?: ReactNode }) {
  return <th className="px-1.5 py-0.5 font-normal">{children}</th>;
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="px-1.5 py-0.5 select-text">{children}</td>;
}
