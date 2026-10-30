import { PlayIcon, StopIcon } from "@phosphor-icons/react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import {
  PROPERTY_ROW_CLASSES,
  RowCaret,
  RowGuides,
} from "../../shared/components/PropertyRowParts";
import { SLOT_ATTRIBUTE } from "../state/rowDrag";
import { audioRowClasses, MIDDLE_BUTTON } from "./audioRow";

/** Returns the DOM id of the row `key`, which the tree names as its active row. */
export function rowId(key: string): string {
  return `event-row-${key}`;
}

/** The parts of a tree row that the frame, the guides and the caret read. */
export interface TreeRowShape {
  readonly key: string;
  readonly kind: string;
  readonly depth: number;
  readonly parent: string | null;
  readonly expandable: boolean;
}

export interface RowFrameProps {
  readonly row: TreeRowShape;
  readonly open: boolean;
  readonly selected: boolean;
  readonly playing: boolean;
  /** Picks the row. The modifiers of the press say how the pick joins the picks. */
  readonly onSelect: (event: {
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
  }) => void;
  readonly onExpand: (open: boolean) => void;
  readonly onHover: () => void;
  /** Opens the editor of the row on a double click. Absent, a double click expands the row. */
  readonly onEdit?: () => void;
  /** Plays the row or stops it, which a middle click runs. Absent, a middle click does nothing. */
  readonly onPlay?: () => void;
  /** Starts a drag of the row from a press. Absent, the row does not drag. */
  readonly onDragPress?: (event: ReactPointerEvent) => void;
  /** What the row takes as a drop: another row, or a row or a file. Absent, it takes none. */
  readonly drops?: "row" | "file";
  /** `true` while the row's node is cut and waits for a paste. */
  readonly cut?: boolean;
  readonly children: ReactNode;
}

/**
 * One line of the tree, which selects on a click, expands or edits on a double click and plays
 * on a middle click. A row that drags or takes drops gets the handlers of "Keys and gestures" in
 * docs/ux/AUDIO.md.
 */
export function RowFrame({
  row,
  open,
  selected,
  playing,
  onSelect,
  onExpand,
  onHover,
  onEdit,
  onPlay,
  onDragPress,
  drops,
  cut = false,
  children,
}: RowFrameProps) {
  return (
    <div
      id={rowId(row.key)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? open : undefined}
      aria-selected={selected}
      data-ui="RowFrame"
      {...{ [SLOT_ATTRIBUTE]: drops === undefined ? undefined : row.key }}
      data-asset-drop={drops === "file" ? "" : undefined}
      className={twMerge(PROPERTY_ROW_CLASSES, audioRowClasses({ selected, playing, cut }), "pl-1")}
      onClick={onSelect}
      onDoubleClick={() => {
        if (onEdit !== undefined) onEdit();
        else if (row.expandable) onExpand(!open);
      }}
      onPointerDown={(event) => {
        /* A middle press scrolls the page in Chromium unless its default is dropped. */
        if (event.button === MIDDLE_BUTTON && onPlay !== undefined) event.preventDefault();
        onDragPress?.(event);
      }}
      onAuxClick={(event) => {
        if (event.button !== MIDDLE_BUTTON || onPlay === undefined) return;

        event.preventDefault();
        onPlay();
      }}
      onPointerEnter={onHover}
    >
      {children}
    </div>
  );
}

interface LeadProps {
  readonly row: TreeRowShape;
  readonly blocks: readonly string[];
  /** The levels whose block ends on the row, which draw a bracket corner. Absent draws guides. */
  readonly ends?: readonly boolean[];
  /** The row's index in its list, which the hover lift of the lanes reads. */
  readonly index?: number;
  readonly open: boolean;
  readonly expandable: boolean;
  readonly onExpand: (open: boolean) => void;
}

/** The guides and the caret of a row. A click on the caret expands or collapses the row. */
export function Lead({ row, blocks, ends, index, open, expandable, onExpand }: LeadProps) {
  return (
    <>
      <RowGuides depth={row.depth} blocks={blocks} ends={ends} index={index} />
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
  /** `true` if a press on the row plays something. `false` leaves the slot empty. */
  readonly playable: boolean;
  readonly playing: boolean;
  readonly onToggle: () => void;
}

/** The play button of a row that plays, and an empty slot of its width on any other row. */
export function PlayButton({ playable, playing, onToggle }: PlayButtonProps) {
  const label = playing ? m.audio_event_stop_action() : m.audio_event_play_action();
  const Glyph = playing ? StopIcon : PlayIcon;

  return (
    <span className="flex w-5 shrink-0 justify-center">
      {playable && (
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
