import { MinusCircleIcon } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
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
import type { EventRow } from "../utils/eventTree";
import { fieldTopic } from "../utils/fieldTopics";
import { movedIndex, treeStep } from "../utils/rowKeys";
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
import { nodeKey } from "./nodeKeys";
import { RowContent } from "./RowContent";

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
}: EventTreeProps) {
  const scroller = useRef<HTMLDivElement>(null);
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

  /** Applies the edit key of `event` to `row`. Returns `true` if the key was an edit key. */
  function editKey(event: KeyboardEvent<HTMLDivElement>, row: EventRow): boolean {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plain && (event.key === "F2" || event.key === "Enter")) {
      if (row.kind === "field") {
        if (editing !== null && row.field.editable) setEntering(row.key);
        return true;
      }
      if ((row.kind === "children" && addsTo(row)) || row.kind === "add") {
        actions?.add?.();
        return true;
      }
      if (event.key === "F2") return true;
    }
    if (editing === null) return false;

    if (nodeKey(event, actions)) return true;

    const container = containerOf(parentOf(row));
    const child = rowObject(row);
    const removable = container !== null && child !== null && isEditable(editing, container.id);
    const moving = event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown");
    if (moving && removable && container.kind === "random") {
      const at = container.playlist.findIndex(
        (item) => container.children[item.child]?.id === child,
      );
      const index = at + (event.key === "ArrowUp" ? -1 : 1);
      if (at >= 0 && index >= 0 && index < container.playlist.length) {
        void editing.edit({ kind: "moveChild", container: container.id, child, index });
      }
      return true;
    }
    return false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    if (selectedRow !== undefined && editKey(event, selectedRow)) {
      event.preventDefault();
      return;
    }

    const target = event.altKey ? null : movedIndex(event.key, selectedIndex, rows.length);
    if (target !== null) {
      event.preventDefault();
      selectAt(target, event.shiftKey);
      return;
    }

    if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      picks.pickAll();
      return;
    }

    const row = selectedRow;
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

    if (event.key === "Escape") {
      event.preventDefault();
      if (player.playing !== null) player.stop();
      else picks.pick(row.key, "only");
      return;
    }

    if (event.key === "c" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onCopy();
    }
  }

  function line(row: EventRow): ReactNode {
    const open = expanded.has(row.key);
    const frame = {
      row,
      open,
      selected: row.key === selected || picks.picked.has(row.key),
      playing: player.playing === row.key,
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
        <span className="ml-auto w-24 shrink-0 pl-3">{thumbnail(row)}</span>
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
    </GuideStoreContext>
  );
}
