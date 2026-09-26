import {
  DiceFiveIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button, SegmentedControl, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { ValueFamily } from "../../values/utils/valueRows";
import type { CurveTab } from "../state/curveTarget";
import { CHANNELS, CHIP } from "../utils/curveChannels";
import { drawsSpread, isRandom, type RandomDraw, rerollsEveryFrame } from "../utils/randomDraw";
import { ChancePin } from "./ChancePin";

interface CurveToolbarProps {
  /** What the row leads with, the target's caption, which gives way first as the pane narrows. */
  lead?: ReactNode;
  family: ValueFamily;
  /** How many channels the value holds. */
  width: number;
  /** The channels the chips turned off. */
  muted: ReadonlySet<number>;
  onToggle: (channel: number) => void;
  draw: RandomDraw | null;
  /** The hash the value sits under, which says whether it re-rolls every frame. */
  field: string | null;
  tab: CurveTab;
  /** The value has keys for a Table to list. */
  tabled: boolean;
  onTab: (tab: CurveTab) => void;
  keyCount: number;
  selectedCount: number;
  editable: boolean;
  onAdd: () => void;
  onRemove: () => void;
  /** Give the curve a table per channel. Null where it has tables or cannot be written. */
  onAddRandom: (() => void) | null;
  /** Clear every table slot, so the curve draws one value again. Null where it has none to clear. */
  onRemoveRandom?: (() => void) | null;
  /** Whether channels drawing one table edit together. Null where none share one. */
  linking: { linked: boolean; onToggle: () => void } | null;
}

/** Every control of the dock in one row: chips, the tables and their faults, the pin, the tabs. */
export function CurveToolbar({
  lead,
  family,
  width,
  muted,
  onToggle,
  draw,
  field,
  tab,
  tabled,
  onTab,
  keyCount,
  selectedCount,
  editable,
  onAdd,
  onRemove,
  onAddRandom,
  onRemoveRandom = null,
  linking,
}: CurveToolbarProps) {
  const names = CHANNELS[family];
  const chips =
    family === "vector" && width > 1 ? Array.from({ length: width }, (_, at) => at) : [];
  const spread = drawsSpread(draw);
  const flickers =
    spread && rerollsEveryFrame(field) && draw.channels.some((each) => isRandom(each.shape));

  return (
    <div
      data-ui="CurveToolbar"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 select-none"
    >
      {lead !== undefined && (
        <span className="flex min-w-0 flex-1 basis-32 items-baseline gap-2 leading-tight">
          {lead}
        </span>
      )}
      {chips.length > 0 && (
        <span className="flex gap-0.5">
          {chips.map((channel) => (
            <button
              key={channel}
              type="button"
              aria-pressed={!muted.has(channel)}
              /* DS-RADIUS, DS-VEIL, DS-TEXT */
              className={twMerge(
                "cursor-pointer rounded-sm px-1.5 font-mono text-meta font-semibold hover:bg-surface-veil",
                muted.has(channel) ? "text-surface-600" : (CHIP[channel] ?? CHIP[0]),
              )}
              onClick={() => onToggle(channel)}
            >
              {names[channel] ?? String(channel)}
            </button>
          ))}
        </span>
      )}
      {draw !== null && (
        <Tooltip content={m.workshop_bin_random_tables_hint()}>
          <span
            tabIndex={0}
            className="flex cursor-help items-center gap-1 rounded-sm text-meta text-surface-300 outline-none focus-visible:ring-1 focus-visible:ring-accent-500"
          >
            <DiceFiveIcon weight="bold" className="h-3.5 w-3.5" />
            {m.workshop_bin_random_chip_label()}
          </span>
        </Tooltip>
      )}
      {draw !== null && onRemoveRandom !== null && (
        <Tooltip content={m.workshop_bin_random_remove_hint()}>
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_random_remove_action()}
            onClick={onRemoveRandom}
            left={<XIcon weight="bold" />}
          />
        </Tooltip>
      )}
      {linking !== null && <LinkToggle {...linking} />}
      {onAddRandom !== null && (
        <Tooltip content={m.workshop_bin_random_add_hint()}>
          <Button
            variant="ghost"
            size="xs"
            onClick={onAddRandom}
            left={<DiceFiveIcon weight="bold" />}
          >
            {m.workshop_bin_random_add_action()}
          </Button>
        </Tooltip>
      )}
      {flickers && (
        <Fault
          tone="warning"
          label={m.workshop_bin_random_flicker_label()}
          hint={m.workshop_bin_random_flicker_hint()}
        />
      )}
      {draw?.broken === true && (
        <Fault
          tone="danger"
          label={m.workshop_bin_random_broken_label()}
          hint={m.workshop_bin_random_broken_hint()}
        />
      )}
      <span className="ml-auto flex items-center gap-1">
        <span className="mr-1 text-meta text-surface-500">
          {m.workshop_bin_curve_keys_label({ count: keyCount })}
          {selectedCount > 0 && (
            <span className="text-surface-400">
              {" · "}
              {m.workshop_bin_curve_selected_count_label({ count: selectedCount })}
            </span>
          )}
        </span>
        <Tooltip content={m.workshop_bin_curve_add_key_action()}>
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_curve_add_key_action()}
            disabled={!editable}
            onClick={onAdd}
            left={<PlusIcon weight="bold" />}
          />
        </Tooltip>
        <Tooltip content={m.workshop_bin_curve_delete_key_action()}>
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_curve_delete_key_action()}
            disabled={!editable || selectedCount === 0}
            onClick={onRemove}
            left={<TrashIcon weight="bold" />}
          />
        </Tooltip>
      </span>
      <span className="flex items-center gap-3">
        {spread && <ChancePin />}
        <SegmentedControl
          size="xs"
          aria-label={m.workshop_bin_curve_tab_label()}
          value={tab}
          onChange={onTab}
          options={[
            { value: "graph", label: m.workshop_bin_curve_tab_graph_label() },
            ...(tabled
              ? [{ value: "table" as const, label: m.workshop_bin_curve_tab_table_label() }]
              : []),
          ]}
        />
      </span>
    </div>
  );
}

/** Whether an edit of one channel also writes the channels drawing its table. */
function LinkToggle({ linked, onToggle }: { linked: boolean; onToggle: () => void }) {
  const label = linked
    ? m.workshop_bin_random_unlink_action()
    : m.workshop_bin_random_link_action();

  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="xs"
        compact
        aria-label={label}
        aria-pressed={linked}
        onClick={onToggle}
        left={linked ? <LinkSimpleIcon weight="bold" /> : <LinkBreakIcon weight="bold" />}
      />
    </Tooltip>
  );
}

/** A fault of the tables, its word in the row and its reason on hover. */
function Fault({ tone, label, hint }: { tone: "warning" | "danger"; label: string; hint: string }) {
  return (
    <Tooltip content={hint}>
      <span
        tabIndex={0}
        /* DS-TEXT */
        className={twMerge(
          "flex cursor-help items-center gap-1 text-meta outline-none focus-visible:ring-1 focus-visible:ring-accent-500",
          tone === "warning" ? "text-warning-text" : "text-danger-text",
        )}
      >
        <WarningCircleIcon weight="bold" className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
    </Tooltip>
  );
}
