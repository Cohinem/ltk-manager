import { MinusCircleIcon } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu } from "@/components";
import { NO_OVERSCROLL, useRemeasure, useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import type { MediaLocation, SetFile } from "@/lib/tauri";
import { measureRow, twMerge } from "@/utils";

import { nameColumnStyle, RowAction } from "../../shared/components/PropertyRowParts";
import { createGuideStore, GuideStoreContext } from "../../shared/state/treeGuides";
import { instantScroll } from "../../shared/utils/instantScroll";
import type { EventPlayer } from "../hooks/useEventPlayer";
import type { TreePicks } from "../hooks/useTreePicks";
import { useTypeAhead } from "../hooks/useTypeAhead";
import { useNodeNames } from "../state/nodeNames";
import { beginRowDrag, useRowDrops } from "../state/rowDrag";
import {
  dropAction,
  type DragPayload,
  type DropAction,
  type DropSlot,
  type ListPlace,
} from "../utils/dropTargets";
import { eventLabel, type EventRow } from "../utils/eventTree";
import { fieldTopic } from "../utils/fieldTopics";
import { type AudioCommandId, resolveCommand } from "../utils/keymap";
import { resetEdit } from "../utils/nodeFields";
import { type NodeNames, nodeText } from "../utils/nodeNames";
import { headIndex, movedIndex, pageRows, treeStep } from "../utils/rowKeys";
import { pickMode } from "../utils/rowSelection";
import {
  childIds,
  containerOf,
  isEditable,
  rowObject,
  takesChild,
  type TreeEditing,
} from "../utils/treeEditing";
import { AddNodeLine } from "./AddNodeLine";
import { AUDIO_LIST_GROUP } from "./audioRow";
import type { NodeActions } from "./EventMenu";
import {
  EditedMark,
  guideBlocks,
  isPlayable,
  Lead,
  nameColumns,
  PlayButton,
  RowFrame,
  rowId,
} from "./EventRowParts";
import { ChildrenValue, FieldNameCell, FieldValue } from "./FieldRows";
import { PlayedByCell } from "./PlayedBy";
import { RowContent } from "./RowContent";
import { RowDragGhost } from "./RowDragGhost";

interface EventTreeProps {
  readonly rows: readonly EventRow[];
  readonly expanded: ReadonlySet<string>;
  readonly onExpand: (key: string, open: boolean) => void;
  /** The key of the row that the keyboard is on. */
  readonly selected: string | null;
  /** The picked rows, which the node actions take. */
  readonly picks: TreePicks;
  readonly player: EventPlayer;
  /** Plays a new pick of `row`, or of every picked row, and stops what played before. */
  readonly onPlay: (row: EventRow) => void;
  /** Copies the names and IDs of the picked rows. */
  readonly onCopy: () => void;
  /** The node actions on the picked rows, or null for a tree that takes no edit. */
  readonly actions: NodeActions | null;
  /** The context menu items of `row`. */
  readonly menu: (row: EventRow) => ReactNode;
  /** The waveform column of `row`. */
  readonly thumbnail: (row: EventRow) => ReactNode;
  /** The open document that the rows edit, or null for a tree that takes no edit. */
  readonly editing?: TreeEditing | null;
  /** The files of the bank set, whose media a new sound plays. */
  readonly files: readonly SetFile[];
  /** The key of the add row whose menu is open. */
  readonly adding?: string | null;
  /** Opens the menu of an add row, or closes it with null. */
  readonly onAdding?: (key: string | null) => void;
  /** Plays `media` under the row `key`, and stops what played before. */
  readonly onPreview: (key: string, media: MediaLocation) => void;
  /** The keys of the rows whose nodes are cut and wait for a paste. */
  readonly cut: ReadonlySet<string>;
  /** Runs a drop of a file on a row. A move within a playlist runs in the tree. */
  readonly onDropAction: (action: DropAction) => void;
}

/** Returns the name that the type-ahead matches and the drag ghost shows for `row`. */
function rowLabel(row: EventRow, names: NodeNames): string {
  if (row.kind === "event") return eventLabel(row.event);
  if (row.kind === "node") return nodeText(names, row.node);

  return "";
}

/** The height of a row in px at 100% zoom: `min-h-6` is six spacing units of 4.5px. */
const ROW_HEIGHT = 27;

/**
 * The events of an event bank, each expanding into its actions, their fields and the objects
 * under them, windowed.
 *
 * An action and a node are each one row, and their fields are child rows that read like a bin's
 * properties: a name and the value in one column. An event and a container end in an add row.
 * One tab stop with `aria-activedescendant`. The keyboard map is "Event tree", "Editing" and
 * "Selection" in docs/ux/AUDIO.md, and the menu key opens the context menu of the selected row.
 */
export function EventTree({
  rows,
  expanded,
  onExpand,
  selected,
  picks,
  player,
  onPlay,
  onCopy,
  actions,
  menu,
  thumbnail,
  editing = null,
  files,
  adding = null,
  onAdding,
  onPreview,
  cut,
  onDropAction,
}: EventTreeProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const listId = useId();
  const names = useNodeNames();
  const byKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
  const nameCols = useMemo(() => nameColumns(rows), [rows]);
  const [guides] = useState(createGuideStore);
  const [entering, setEntering] = useState<string | null>(null);

  /* A field that commits or drops its text leaves focus on no element, and the tree takes it
     back, so a run of edits stays on the keyboard. */
  function returnFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) scroller.current?.focus();
    });
  }

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
  const selectedRow = rows[selectedIndex];
  useEffect(() => guides.set({ active: selectedRow?.parent ?? null }), [guides, selectedRow]);

  function selectAt(index: number, range = false) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row === undefined) return;

    picks.pick(row.key, range ? "range" : "only");
    virtualizer.scrollToIndex(rows.indexOf(row), { align: "auto" });
  }

  function parentOf(row: EventRow): EventRow | undefined {
    return row.parent === null ? undefined : byKey.get(row.parent);
  }

  /** Returns `true` if the children row `row` belongs to a container that takes a new child. */
  function addsTo(row: EventRow): boolean {
    const container = parentOf(row);
    return (
      container?.kind === "node" &&
      takesChild(container.node) &&
      isEditable(editing, container.node.id)
    );
  }

  /** Returns the place of `row` in the playlist of its random container, which a move reorders. */
  function placeOf(row: EventRow): ListPlace | null {
    const container = containerOf(parentOf(row));
    const child = rowObject(row);
    if (container?.kind !== "random" || child === null || !isEditable(editing, container.id)) {
      return null;
    }

    const index = container.playlist.findIndex(
      (item) => container.children[item.child]?.id === child,
    );
    return index < 0 ? null : { list: `c:${container.id}`, index };
  }

  /** Moves `row` to `index` of the playlist of its random container. */
  function moveTo(row: EventRow, index: number) {
    const container = containerOf(parentOf(row));
    const child = rowObject(row);
    if (editing === null || container?.kind !== "random" || child === null) return;
    if (index < 0 || index >= container.playlist.length) return;

    void editing.edit({ kind: "moveChild", container: container.id, child, index });
  }

  /** Returns what a drop on `row` reads, or null for a row that takes no drop. */
  function slotOf(row: EventRow): DropSlot | null {
    if (editing === null) return null;
    if (row.kind === "add") return { kind: "add", key: row.key, into: row.into };
    if (row.kind !== "node") return null;

    const place = placeOf(row);
    if (row.node.kind === "sound") {
      return { kind: "sound", key: row.key, source: row.node.source, place };
    }
    return { kind: "container", key: row.key, place };
  }

  /** Returns what a drag of `row` carries: a named event, or a child of a playlist. */
  function payloadOf(row: EventRow): DragPayload | null {
    if (row.kind === "event") {
      return row.event.name === null ? null : { kind: "event", name: row.event.name };
    }

    const place = placeOf(row);
    return place === null ? null : { kind: "row", key: row.key, place };
  }

  useRowDrops(scroller, (key, payload) => {
    const row = byKey.get(key);
    const slot = row === undefined ? null : slotOf(row);
    const action = slot === null ? null : dropAction(payload, slot);
    if (action === null) return false;

    const moved = action.kind === "move" ? byKey.get(action.key) : undefined;
    if (moved !== undefined && action.kind === "move") moveTo(moved, action.index);
    else onDropAction(action);
    return true;
  });

  const typeAhead = useTypeAhead(
    () => rows.map((row) => rowLabel(row, names)),
    selectedIndex,
    (index) => selectAt(index),
  );

  /** Plays `row`, or stops it if it plays. */
  function togglePlay(row: EventRow) {
    if (player.playing === row.key) player.stop();
    else onPlay(row);
  }

  /** Returns the event row that `row` sits under, or `row` itself for an event. */
  function eventOf(row: EventRow): EventRow | undefined {
    let at: EventRow | undefined = row;
    while (at !== undefined && at.kind !== "event") at = parentOf(at);
    return at;
  }

  /** Opens the entry of a field row or the add row, or plays any other row on Enter. */
  function enterRow(key: string, row: EventRow) {
    if (row.kind === "field") {
      if (editing !== null && row.field.editable) setEntering(row.key);
      return;
    }
    if ((row.kind === "children" && addsTo(row)) || row.kind === "add") {
      actions?.add?.();
      return;
    }
    if (key === "Enter") onPlay(row);
  }

  /** Sets the field of a field row to its default. */
  function resetField(row: EventRow): boolean {
    const edit = row.kind === "field" ? resetEdit(row.field) : null;
    if (editing === null || edit === null) return false;

    void editing.edit(edit);
    return true;
  }

  /** Runs the node action of `command` on the picks. A bank that takes no edit swallows the key. */
  function runAction(command: AudioCommandId) {
    if (actions === null) return;

    if (command === "wrap") actions.wrap?.("random");
    if (command === "add") actions.add?.();
    if (command === "duplicate") actions.duplicate?.();
    if (command === "remove") actions.remove?.();
    if (command === "cut") actions.cut?.();
    if (command === "paste") actions.paste?.();
  }

  /**
   * Runs `command`, which the key `key` resolved to, on the selected `row`.
   *
   * Returns `true` if the tree answers the key, which then reaches no handler above the tree.
   */
  function run(command: AudioCommandId, key: string, row: EventRow | undefined): boolean {
    switch (command) {
      case "moveRow":
      case "movePage":
      case "moveEnd":
      case "extendRange": {
        const page = pageRows(scroller.current, rowHeight);
        const target = movedIndex(key, selectedIndex, rows.length, page);
        if (target !== null) selectAt(target, command === "extendRange");
        return true;
      }
      case "nextEvent":
      case "previousEvent": {
        const at = headIndex(rows, selectedIndex, command === "nextEvent" ? 1 : -1, "event");
        if (at !== null) selectAt(at);
        return true;
      }
      case "selectAll":
        picks.pickAll();
        return true;
      case "copy":
        onCopy();
        return true;
      case "add":
      case "duplicate":
      case "remove":
      case "wrap":
      case "cut":
      case "paste":
        runAction(command);
        return true;
      default:
        break;
    }

    if (row === undefined) return false;

    switch (command) {
      case "play":
        togglePlay(row);
        return true;
      case "playAll": {
        const head = eventOf(row);
        if (head !== undefined) onPlay(head);
        return true;
      }
      case "stop":
        if (player.playing !== null) player.stop();
        else if (picks.picked.size > 1) picks.pick(row.key, "only");
        else return false;
        return true;
      case "stepRight":
      case "stepLeft": {
        const step = treeStep(key, rows, selectedIndex, expanded);
        if (step?.kind === "expand") onExpand(step.key, step.open);
        if (step?.kind === "select") selectAt(step.index);
        return true;
      }
      case "enter":
        enterRow(key, row);
        return true;
      case "reset":
        return resetField(row);
      case "moveUp":
      case "moveDown": {
        const place = placeOf(row);
        if (place !== null) moveTo(row, place.index + (command === "moveUp" ? -1 : 1));
        return place !== null;
      }
      default:
        return false;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    const command = resolveCommand(event, "structure");
    const handled = command === null ? typeAhead(event) : run(command, event.key, selectedRow);
    if (!handled) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function line(row: EventRow): ReactNode {
    const open = expanded.has(row.key);
    const slot = slotOf(row);
    const payload = payloadOf(row);
    const frame = {
      row,
      open,
      selected: row.key === selected || picks.picked.has(row.key),
      playing: player.playing === row.key,
      cut: cut.has(row.key),
      drops:
        slot === null
          ? undefined
          : slot.kind === "container"
            ? ("row" as const)
            : ("file" as const),
      onDragPress:
        payload === null
          ? undefined
          : (event: ReactPointerEvent) =>
              beginRowDrag(event, payload, listId, rowLabel(row, names)),
      onPlay: isPlayable(row) ? () => togglePlay(row) : undefined,
      blocks: guideBlocks(row, byKey),
      onSelect: (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
        picks.pick(row.key, pickMode(event)),
      onExpand: (next: boolean) => onExpand(row.key, next),
      onHover: () => guides.set({ hover: row.parent }),
    };

    if (row.kind === "field") {
      const enter = (open: boolean) =>
        setEntering((current) => (open ? row.key : current === row.key ? null : current));
      return (
        <RowFrame
          {...frame}
          onEdit={editing !== null && row.field.editable ? () => enter(true) : undefined}
        >
          <FieldNameCell
            topic={fieldTopic(row.field)}
            lead={<Lead {...frame} expandable={false} />}
          />
          <FieldValue
            field={row.field}
            editing={editing}
            entering={entering === row.key}
            onEntering={enter}
            onLeave={returnFocus}
          />
        </RowFrame>
      );
    }

    if (row.kind === "children") {
      return (
        <RowFrame {...frame}>
          <FieldNameCell topic={null} lead={<Lead {...frame} expandable />} />
          <ChildrenValue
            count={row.count}
            onAdd={
              addsTo(row)
                ? () => {
                    picks.pick(row.key, "only");
                    onAdding?.(`${row.key}:add`);
                    onExpand(row.key, true);
                  }
                : undefined
            }
          />
        </RowFrame>
      );
    }

    if (row.kind === "add") {
      const owner = parentOf(row);
      const exclude =
        owner?.kind === "children"
          ? new Set([owner.node.id, ...childIds(owner.node)])
          : new Set<number>();
      return (
        <RowFrame {...frame}>
          <Lead {...frame} expandable={false} />
          {editing !== null && (
            <AddNodeLine
              into={row.into}
              editing={editing}
              files={files}
              exclude={exclude}
              opening={adding === row.key}
              onOpening={(next) => onAdding?.(next ? row.key : null)}
              onPreview={(media) => onPreview(row.key, media)}
              onLeave={returnFocus}
            />
          )}
        </RowFrame>
      );
    }

    const container = containerOf(parentOf(row));
    const child = rowObject(row);
    const removable =
      editing !== null && container !== null && child !== null && isEditable(editing, container.id);
    return (
      <RowFrame {...frame}>
        <Lead {...frame} expandable={row.expandable} />
        <PlayButton
          playable={isPlayable(row)}
          playing={frame.playing}
          onToggle={() => {
            if (!picks.picked.has(row.key)) picks.pick(row.key, "only");
            if (player.playing === row.key) player.stop();
            else onPlay(row);
          }}
        />
        <RowContent row={row} />
        {editing !== null && editing.edited.has(child ?? -1) && <EditedMark />}
        {removable && (
          <RowAction
            label={m.audio_edit_remove_child_action()}
            icon={MinusCircleIcon}
            onAct={() => void editing.edit({ kind: "delete", object: child, parent: container.id })}
          />
        )}
        {player.failed.has(row.key) && (
          <span className="text-meta text-danger-text">{m.audio_event_play_failed_label()}</span>
        )}
        {row.kind === "event" && <PlayedByCell event={row.event} />}
        <span className={twMerge("w-24 shrink-0 pl-3", row.kind !== "event" && "ml-auto")}>
          {thumbnail(row)}
        </span>
      </RowFrame>
    );
  }

  return (
    <GuideStoreContext value={guides}>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          onContextMenuCapture={() => setMenuRow(selectedRow ?? null)}
          ref={scroller}
          role="tree"
          tabIndex={0}
          aria-label={m.audio_events_tree_label()}
          aria-multiselectable
          aria-activedescendant={selected === null ? undefined : rowId(selected)}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            if (event.target === event.currentTarget && selectedIndex < 0) selectAt(0);
          }}
          onPointerLeave={() => guides.set({ hover: null })}
          data-ui="EventTree"
          className={twMerge(
            AUDIO_LIST_GROUP,
            "min-h-0 flex-1 overflow-auto text-row scrollbar-md select-none focus-visible:outline-none",
          )}
          {...NO_OVERSCROLL}
        >
          <div
            className="relative w-full min-w-max"
            style={{ height: virtualizer.getTotalSize(), ...nameColumnStyle(nameCols) }}
          >
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
                    if (!picks.picked.has(row.key)) picks.pick(row.key, "only");
                    setMenuRow(row);
                  }}
                >
                  {line(row)}
                </div>
              );
            })}
          </div>
        </ContextMenu.Trigger>
        {menuRow !== null && <ContextMenu.Content>{menu(menuRow)}</ContextMenu.Content>}
      </ContextMenu.Root>
      <RowDragGhost source={listId} />
    </GuideStoreContext>
  );
}
