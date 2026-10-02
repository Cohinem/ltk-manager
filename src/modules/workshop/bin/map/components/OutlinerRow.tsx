import {
  CaretRightIcon,
  CastleTurretIcon,
  CubeIcon,
  EyeIcon,
  EyeSlashIcon,
  type Icon,
  LightningIcon,
  MapPinIcon,
  SelectionIcon,
  SparkleIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import type { MouseEvent } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import type { MapItemKind } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { MatchedText } from "../../../shared/components/MatchedText";
import { chunkLabel, isDrawn, type OutlineRow } from "../utils/mapOutline";

const KIND_ICON: Record<MapItemKind, Icon> = {
  particle: SparkleIcon,
  character: CastleTurretIcon,
  locator: MapPinIcon,
  group: SelectionIcon,
  audio: SpeakerHighIcon,
  other: CubeIcon,
};

interface OutlinerRowProps {
  /** The row's element id, which the tree names as its active descendant. */
  readonly domId: string;
  readonly row: OutlineRow;
  readonly hidden: boolean;
  /** The camera was last sent to this row. */
  readonly focused: boolean;
  /** The placeable is in the selection the viewport and the outliner share. */
  readonly selected: boolean;
  /** The keyboard stands on this row. */
  readonly active: boolean;
  /** The search text, marked where the row's text holds it. */
  readonly query: string;
  /** The filter narrows the tree, so a chunk counts what it keeps of what it holds. */
  readonly narrowed: boolean;
  readonly onActivate: (event: MouseEvent) => void;
  readonly onHide: () => void;
}

/**
 * One row of the map outliner: a chunk with its caret and count, or a placeable with its
 * kind, class and the marker of an event that shows it. An eye hides what the scene draws.
 */
export function OutlinerRow({
  domId,
  row,
  hidden,
  focused,
  selected,
  active,
  query,
  narrowed,
  onActivate,
  onHide,
}: OutlinerRowProps) {
  const chunk = row.type === "chunk";
  const Glyph = row.type === "chunk" ? null : KIND_ICON[row.item.kind];

  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={chunk ? 1 : 2}
      aria-expanded={row.type === "chunk" ? row.open : undefined}
      aria-selected={selected}
      className={twMerge(
        /* DS-VEIL, DS-RADIUS */
        "group/row flex h-full cursor-pointer items-center gap-1.5 rounded-sm pr-1 hover:bg-surface-veil-soft",
        !chunk && "pl-5",
        selected && "bg-accent-500/15",
        focused && "text-accent-300",
        active && "ring-1 ring-accent-500/60 ring-inset",
        hidden && "text-surface-500",
      )}
      onClick={onActivate}
    >
      {row.type === "chunk" && (
        <span className="flex h-4 w-3 shrink-0 items-center justify-center text-surface-400">
          <CaretRightIcon weight="bold" className={twMerge("size-3", row.open && "rotate-90")} />
        </span>
      )}
      {Glyph !== null && <Glyph className="size-3.5 shrink-0 text-surface-400" />}
      <span className="min-w-0 truncate">
        <MatchedText
          text={row.type === "chunk" ? chunkLabel(row.chunk) : row.item.name}
          query={query}
        />
      </span>
      {row.type === "item" && row.item.controller !== null && <EventMark />}
      <span className="ml-auto shrink-0 truncate pl-2 text-meta text-surface-400">
        {row.type === "chunk" && <ChunkCount row={row} narrowed={narrowed} />}
        {row.type === "item" && <MatchedText text={row.item.class} query={query} />}
      </span>
      {(row.type === "chunk" || isDrawn(row.item)) && (
        <EyeButton hidden={hidden} onClick={onHide} />
      )}
    </div>
  );
}

function ChunkCount({
  row,
  narrowed,
}: {
  row: Extract<OutlineRow, { type: "chunk" }>;
  narrowed: boolean;
}) {
  if (!narrowed) return row.chunk.items.length;
  return `${row.shown}/${row.chunk.items.length}`;
}

/** The marker of a placeable an event shows, which the Event effects switch plays. */
function EventMark() {
  const hint = m.workshop_bin_map_outliner_event_hint();
  return (
    <Tooltip content={hint}>
      <span aria-label={hint} className="flex shrink-0 text-warning-text">
        <LightningIcon weight="fill" className="size-3" />
      </span>
    </Tooltip>
  );
}

function EyeButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const label = hidden
    ? m.workshop_bin_map_outliner_show_action()
    : m.workshop_bin_map_outliner_hide_action();
  const Eye = hidden ? EyeSlashIcon : EyeIcon;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      /* DS-VEIL, DS-RADIUS. A hidden row keeps its eye on screen, since that is what says it is hidden. */
      className={twMerge(
        "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 hover:bg-surface-veil hover:text-surface-200",
        !hidden && "opacity-0 group-hover/row:opacity-100",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Eye weight="bold" className="size-3.5" />
    </button>
  );
}
