import { PlayIcon, StopIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import {
  PROPERTY_ROW_CLASSES,
  RowCaret,
  RowGuides,
} from "../../shared/components/PropertyRowParts";
import { nameColumnCols, rowNameCols } from "../../shared/utils/propertyRows";
import { childrenOf, type EventRow } from "../utils/eventTree";
import { audioRowClasses } from "./audioRow";
import { fieldName } from "./FieldRows";

/** Returns the DOM id of the row `key`, which the tree names as its active row. */
export function rowId(key: string): string {
  return `event-row-${key}`;
}

/** Returns the width of the name column over the field and children rows of `rows`. */
export function nameColumns(rows: readonly EventRow[]): number {
  const widths: number[] = [];
  for (const row of rows) {
    const name = fieldName(row);
    if (name !== null) widths.push(rowNameCols(row.depth, name, []));
  }

  return nameColumnCols(widths);
}

/** Returns the key of the row that holds each guide level of `row`, outermost first. */
export function guideBlocks(row: EventRow, byKey: ReadonlyMap<string, EventRow>): string[] {
  const blocks: string[] = [];
  let parent = row.parent;
  while (parent !== null) {
    blocks.unshift(parent);
    parent = byKey.get(parent)?.parent ?? null;
  }
  return blocks;
}

/** Returns `true` if a press on `row` plays something. */
export function isPlayable(row: EventRow): boolean {
  if (row.kind === "event") return row.event.mediaCount > 0;
  if (row.kind === "action") return row.action.node !== null;
  if (row.kind !== "node") return false;

  return row.node.kind === "sound" ? row.node.media !== null : childrenOf(row.node).length > 0;
}

export interface RowFrameProps {
  readonly row: EventRow;
  readonly open: boolean;
  readonly selected: boolean;
  readonly playing: boolean;
  readonly onSelect: () => void;
  readonly onExpand: (open: boolean) => void;
  readonly onHover: () => void;
  /** Opens the editor of the row on a double click. Absent, a double click expands the row. */
  readonly onEdit?: () => void;
  readonly children: ReactNode;
}

/** One line of the tree, which selects on a click and expands or edits on a double click. */
export function RowFrame({
  row,
  open,
  selected,
  playing,
  onSelect,
  onExpand,
  onHover,
  onEdit,
  children,
}: RowFrameProps) {
  return (
    <div
      id={rowId(row.key)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? open : undefined}
      aria-selected={selected}
      data-ui="EventTree:row"
      className={twMerge(PROPERTY_ROW_CLASSES, audioRowClasses({ selected, playing }), "pl-1")}
      onClick={onSelect}
      onDoubleClick={() => {
        if (onEdit !== undefined) onEdit();
        else if (row.expandable) onExpand(!open);
      }}
      onPointerEnter={onHover}
    >
      {children}
    </div>
  );
}

interface LeadProps {
  readonly row: EventRow;
  readonly blocks: readonly string[];
  readonly open: boolean;
  readonly expandable: boolean;
  readonly onExpand: (open: boolean) => void;
}

/** The guides and the caret of a row. A click on the caret expands or collapses the row. */
export function Lead({ row, blocks, open, expandable, onExpand }: LeadProps) {
  return (
    <>
      <RowGuides depth={row.depth} blocks={blocks} />
      <span
        className={twMerge("flex", expandable && "cursor-pointer")}
        onClick={(event) => {
          if (!expandable) return;

          event.stopPropagation();
          onExpand(!open);
        }}
      >
        <RowCaret expandable={expandable} expanded={open} loading={row.kind === "loading"} />
      </span>
    </>
  );
}

interface PlayButtonProps {
  readonly row: EventRow;
  readonly playing: boolean;
  readonly onToggle: () => void;
}

/** The play button of a row that plays, and an empty slot of its width on any other row. */
export function PlayButton({ row, playing, onToggle }: PlayButtonProps) {
  const label = playing ? m.audio_event_stop_action() : m.audio_event_play_action();
  const Glyph = playing ? StopIcon : PlayIcon;

  return (
    <span className="flex w-5 shrink-0 justify-center">
      {isPlayable(row) && (
        <IconButton
          size="row"
          tabIndex={-1}
          icon={<Glyph weight="fill" />}
          label={label}
          pressed={playing}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        />
      )}
    </span>
  );
}

/** The accent dot of a row whose object differs from the bank as it was opened. */
export function EditedMark() {
  return (
    <Tooltip content={m.audio_edit_edited_label()}>
      <span
        role="img"
        aria-label={m.audio_edit_edited_label()}
        className="size-1.5 shrink-0 rounded-full bg-accent-500"
      />
    </Tooltip>
  );
}
