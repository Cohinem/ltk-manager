import {
  CaretDownIcon,
  CaretRightIcon,
  PlayIcon,
  StopIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, type ReactNode, useCallback, useRef, useState } from "react";

import { Badge, Code, ContextMenu, IconButton, Tooltip } from "@/components";
import { NO_OVERSCROLL, useRemeasure, useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import type {
  Audience,
  AudioEvent,
  EventAction,
  EventContext,
  EventNode,
  EventStatus,
} from "@/lib/tauri";
import { measureRow, twMerge } from "@/utils";

import { instantScroll } from "../../shared/utils/instantScroll";
import type { EventPlayer } from "../hooks/useEventPlayer";
import { childrenOf, type EventRow, eventLabel, objectLabel } from "../utils/eventTree";
import { movedIndex, treeStep } from "../utils/rowKeys";

interface EventTreeProps {
  readonly rows: readonly EventRow[];
  readonly expanded: ReadonlySet<string>;
  readonly onExpand: (key: string, open: boolean) => void;
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  readonly player: EventPlayer;
  /** Plays a new pick of `row`, and stops what played before. */
  readonly onPlay: (row: EventRow) => void;
  /** Copies the name of an event row, or the ID of any other row. */
  readonly onCopy: (row: EventRow) => void;
  /** The context menu items of `row`. */
  readonly menu: (row: EventRow) => ReactNode;
  /** The waveform column of `row`. */
  readonly thumbnail: (row: EventRow) => ReactNode;
}

/** The height of a row in px at 100% zoom: `h-6` is six spacing units of 4.5px. */
const ROW_HEIGHT = 27;

/** The indent of one tree level in px. */
const INDENT = 16;

/**
 * The events of an event bank, each expanding into its actions and the objects under them,
 * windowed.
 *
 * One tab stop with `aria-activedescendant`. The keyboard map is "Event tree" in
 * docs/ux/AUDIO.md, and the menu key opens the context menu of the selected row.
 */
export function EventTree({
  rows,
  expanded,
  onExpand,
  selected,
  onSelect,
  player,
  onPlay,
  onCopy,
  menu,
  thumbnail,
}: EventTreeProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [menuRow, setMenuRow] = useState<EventRow | null>(null);
  const zoomed = useZoomedPx();
  const rowHeight = zoomed(ROW_HEIGHT);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: useCallback((index: number) => rows[index]?.key ?? index, [rows]),
    scrollToFn: instantScroll,
    measureElement: measureRow,
  });
  useRemeasure(virtualizer, rowHeight);

  const selectedIndex = rows.findIndex((row) => row.key === selected);

  function selectAt(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row === undefined) return;

    onSelect(row.key);
    virtualizer.scrollToIndex(rows.indexOf(row), { align: "auto" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    const target = movedIndex(event.key, selectedIndex, rows.length);
    if (target !== null) {
      event.preventDefault();
      selectAt(target);
      return;
    }

    const row = rows[selectedIndex];
    if (row === undefined) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = treeStep(event.key, rows, selectedIndex, expanded);
      if (step?.kind === "expand") onExpand(step.key, step.open);
      if (step?.kind === "select") selectAt(step.index);
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onPlay(row);
      return;
    }

    if (event.key === "Escape" && player.playing !== null) {
      event.preventDefault();
      player.stop();
      return;
    }

    if (event.key === "c" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onCopy(row);
    }
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        onContextMenuCapture={() => setMenuRow(rows[selectedIndex] ?? null)}
        ref={scroller}
        role="tree"
        tabIndex={0}
        aria-label={m.audio_events_tree_label()}
        aria-activedescendant={selected === null ? undefined : rowId(selected)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          if (event.target === event.currentTarget && selectedIndex < 0) selectAt(0);
        }}
        data-ui="EventTree"
        className="min-h-0 flex-1 overflow-auto text-row scrollbar-md select-none focus-visible:outline-none"
        {...NO_OVERSCROLL}
      >
        <div className="relative w-full min-w-max" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (row === undefined) return null;

            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
                onContextMenu={() => {
                  onSelect(row.key);
                  setMenuRow(row);
                }}
              >
                <EventLine
                  row={row}
                  open={expanded.has(row.key)}
                  selected={row.key === selected}
                  playing={player.playing === row.key}
                  failed={player.failed.has(row.key)}
                  thumbnail={thumbnail(row)}
                  onSelect={() => onSelect(row.key)}
                  onExpand={(open) => onExpand(row.key, open)}
                  onToggle={() => {
                    onSelect(row.key);
                    if (player.playing === row.key) player.stop();
                    else onPlay(row);
                  }}
                />
              </div>
            );
          })}
        </div>
      </ContextMenu.Trigger>
      {menuRow !== null && <ContextMenu.Content>{menu(menuRow)}</ContextMenu.Content>}
    </ContextMenu.Root>
  );
}

/** Returns the DOM id of the row `key`, which the tree names as its active row. */
function rowId(key: string): string {
  return `event-row-${key}`;
}

/** Returns `true` if a press on `row` plays something. */
export function isPlayable(row: EventRow): boolean {
  if (row.kind === "event") return row.event.mediaCount > 0;
  if (row.kind === "action") return row.action.node !== null;
  if (row.kind !== "node") return false;

  return row.node.kind === "sound" ? row.node.media !== null : childrenOf(row.node).length > 0;
}

interface EventLineProps {
  readonly row: EventRow;
  readonly open: boolean;
  readonly selected: boolean;
  readonly playing: boolean;
  readonly failed: boolean;
  readonly thumbnail: ReactNode;
  readonly onSelect: () => void;
  readonly onExpand: (open: boolean) => void;
  readonly onToggle: () => void;
}

/** One row of the tree: the caret, the play button, what the row is and its waveform. */
function EventLine({
  row,
  open,
  selected,
  playing,
  failed,
  thumbnail,
  onSelect,
  onExpand,
  onToggle,
}: EventLineProps) {
  return (
    <div
      id={rowId(row.key)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? open : undefined}
      aria-selected={selected}
      data-ui="EventTree:row"
      /* DS-VEIL, DS-RADIUS */
      className={twMerge(
        "flex h-6 items-center gap-1.5 rounded-sm pr-2 hover:bg-surface-veil-soft",
        selected && "bg-accent-500/10",
        playing && "bg-accent-500/15",
      )}
      style={{ paddingLeft: row.depth * INDENT + 4 }}
      onClick={onSelect}
      onDoubleClick={() => row.expandable && onExpand(!open)}
    >
      <span className="flex w-4 shrink-0 justify-center text-surface-400">
        {row.expandable && (
          <IconButton
            size="row"
            tabIndex={-1}
            icon={open ? <CaretDownIcon weight="bold" /> : <CaretRightIcon weight="bold" />}
            label={open ? m.audio_event_collapse_action() : m.audio_event_expand_action()}
            tooltip={false}
            onClick={(event) => {
              event.stopPropagation();
              onExpand(!open);
            }}
          />
        )}
      </span>
      <span className="flex w-5 shrink-0 justify-center">
        {isPlayable(row) && (
          <IconButton
            size="row"
            tabIndex={-1}
            icon={playing ? <StopIcon weight="fill" /> : <PlayIcon weight="fill" />}
            label={playing ? m.audio_event_stop_action() : m.audio_event_play_action()}
            pressed={playing}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          />
        )}
      </span>
      <RowContent row={row} />
      {failed && (
        <span className="text-meta text-danger-text">{m.audio_event_play_failed_label()}</span>
      )}
      <span className="ml-auto w-24 shrink-0 pl-3">{thumbnail}</span>
    </div>
  );
}

/** What one row is, by its kind. */
function RowContent({ row }: { row: EventRow }) {
  switch (row.kind) {
    case "event":
      return <EventContent event={row.event} />;
    case "action":
      return <ActionContent action={row.action} />;
    case "node":
      return <NodeContent node={row.node} />;
    case "loading":
      return <span className="text-meta text-surface-400">{m.audio_event_loading_label()}</span>;
    case "failed":
      return (
        <Status tone="danger">
          <span className="select-text">{row.message}</span>
        </Status>
      );
  }
}

function EventContent({ event }: { event: AudioEvent }) {
  return (
    <>
      <span
        className={twMerge(
          "truncate font-medium",
          event.name === null ? "text-surface-300" : "text-surface-100",
        )}
      >
        {eventLabel(event)}
      </span>
      <span className="shrink-0 text-meta text-surface-400">
        {m.audio_event_actions_label({ count: event.actionCount })}
      </span>
      <EventStatusMark status={event.status} />
      {event.contexts.length > 0 && <EventContexts contexts={event.contexts} />}
    </>
  );
}

const AUDIENCE_LABELS: Record<Audience, () => string> = {
  owner: m.audio_event_audience_owner_label,
  ally: m.audio_event_audience_ally_label,
  enemy: m.audio_event_audience_enemy_label,
  spectator: m.audio_event_audience_spectator_label,
};

/** Returns the situation, the rule and the audience of `context` on one line. */
function contextLabel(context: EventContext): string {
  return m.audio_event_context_label({
    situation: context.situation,
    rule: context.rule ?? m.audio_event_context_unnamed_rule_label(),
    audience: AUDIENCE_LABELS[context.audience](),
  });
}

/** The first contextual rule that plays an event, and how many more do, as an inferred badge. */
function EventContexts({ contexts }: { contexts: readonly EventContext[] }) {
  const [first] = contexts;
  if (first === undefined) return null;

  const hint = first.ambiguous
    ? m.audio_event_context_ambiguous_hint()
    : m.audio_event_context_inferred_hint();
  const label =
    contexts.length > 1
      ? m.audio_event_contexts_label({ context: contextLabel(first), more: contexts.length - 1 })
      : contextLabel(first);

  return (
    <Tooltip content={hint}>
      <Badge size="sm" dashed>
        {label}
      </Badge>
    </Tooltip>
  );
}

function EventStatusMark({ status }: { status: EventStatus }) {
  switch (status.kind) {
    case "resolved":
      return null;
    case "mediaMissing":
      return <Status tone="warning">{m.audio_event_media_missing_label()}</Status>;
    case "objectMissing":
      return <Status tone="warning">{m.audio_event_object_missing_label()}</Status>;
    case "decodeError":
      return (
        <Status tone="danger">
          {m.audio_event_decode_error_label({ object: String(status.object) })}
          <span className="select-text">{status.message}</span>
        </Status>
      );
  }
}

function ActionContent({ action }: { action: EventAction }) {
  if (action.label === null) {
    return (
      <Status tone="warning">
        {m.audio_event_missing_action_label({ id: String(action.id) })}
      </Status>
    );
  }

  return (
    <>
      <span className="text-surface-200">{action.label}</span>
      {action.target !== null && (
        <span className="text-meta text-surface-400">
          <Code>{objectLabel(action.target)}</Code>
        </span>
      )}
    </>
  );
}

const CONTAINER_LABELS = {
  random: { title: m.audio_node_random_label, hint: m.audio_node_random_hint },
  switch: { title: m.audio_node_switch_label, hint: m.audio_node_switch_hint },
  layer: { title: m.audio_node_layer_label, hint: m.audio_node_layer_hint },
  mixer: { title: m.audio_node_mixer_label, hint: m.audio_node_mixer_hint },
} as const;

function NodeContent({ node }: { node: EventNode }) {
  switch (node.kind) {
    case "sound":
      return (
        <>
          <span className="text-surface-200">
            {m.audio_node_sound_label({ id: String(node.id) })}
          </span>
          <span className="text-meta text-surface-400">
            <Code>{node.source}</Code>
          </span>
          {node.media !== null && (
            <span className="truncate text-meta text-surface-400 select-text">
              {fileName(node.media.path)}
            </span>
          )}
          {node.media === null && (
            <Status tone="warning">{m.audio_event_media_missing_label()}</Status>
          )}
        </>
      );
    case "random":
    case "switch":
    case "layer":
    case "mixer": {
      const labels = CONTAINER_LABELS[node.kind];
      return (
        <>
          <span className="text-surface-200">{labels.title({ id: String(node.id) })}</span>
          <span className="text-meta text-surface-400">{labels.hint()}</span>
        </>
      );
    }
    case "unsupported": {
      const hint = node.music ? m.audio_node_music_hint() : m.audio_node_unsupported_hint();
      return (
        <>
          <span className="text-surface-300">
            {m.audio_node_unsupported_label({ kind: node.kindName, id: String(node.id) })}
          </span>
          <span className="text-meta text-surface-400">{hint}</span>
        </>
      );
    }
    case "missing":
      return <Status tone="warning">{m.audio_node_missing_label({ id: String(node.id) })}</Status>;
  }
}

/** A status label with its glyph. DS-TEXT. */
function Status({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  const Icon = tone === "warning" ? WarningIcon : XCircleIcon;
  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1 text-meta",
        tone === "warning" ? "text-warning-text" : "text-danger-text",
      )}
    >
      <Icon weight="fill" className="shrink-0" />
      {children}
    </span>
  );
}

/** Returns the last segment of the game path `path`. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
