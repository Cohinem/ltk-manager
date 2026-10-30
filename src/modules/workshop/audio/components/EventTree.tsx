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
import { measureRow, twMerge } from "@/utils";

import { nameColumnStyle, RowAction } from "../../shared/components/PropertyRowParts";
import { createGuideStore, GuideStoreContext } from "../../shared/state/treeGuides";
import { instantScroll } from "../../shared/utils/instantScroll";
import type { EventPlayer } from "../hooks/useEventPlayer";
import type { EventRow } from "../utils/eventTree";
import { movedIndex, treeStep } from "../utils/rowKeys";
import {
  childIds,
  containerOf,
  isEditable,
  rowObject,
  takesChild,
  type TreeEditing,
} from "../utils/treeEditing";
import { AUDIO_LIST_GROUP } from "./audioRow";
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
import { ChildrenValue, FieldNameCell, fieldName, FieldValue, NodePicker } from "./FieldRows";
import { RowContent } from "./RowContent";

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
  /** The open document that the rows edit, or null for a tree that takes no edit. */
  readonly editing?: TreeEditing | null;
  /** The key of the container row whose child picker is open. */
  readonly adding?: string | null;
  /** Opens the child picker of a container row, or closes it with null. */
  readonly onAdding?: (key: string | null) => void;
}

/** The height of a row in px at 100% zoom: `min-h-6` is six spacing units of 4.5px. */
const ROW_HEIGHT = 27;

/**
 * The events of an event bank, each expanding into its actions, their fields and the objects
 * under them, windowed.
 *
 * An action and a node are each one row, and their fields are child rows that read like a bin's
 * properties: a name and the value in one column. One tab stop with
 * `aria-activedescendant`. The keyboard map is "Event tree" and "Editing" in docs/ux/AUDIO.md, and
 * the menu key opens the context menu of the selected row.
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
  editing = null,
  adding = null,
  onAdding,
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

  function closePicker() {
    onAdding?.(null);
    returnFocus();
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

  function selectAt(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (row === undefined) return;

    onSelect(row.key);
    virtualizer.scrollToIndex(rows.indexOf(row), { align: "auto" });
  }

  function parentOf(row: EventRow): EventRow | undefined {
    return row.parent === null ? undefined : byKey.get(row.parent);
  }

  /** Returns the key of the container whose picker `row` opens, or null if it opens none. */
  function pickerOf(row: EventRow): string | null {
    const container = row.kind === "children" ? parentOf(row) : row;
    if (container?.kind !== "node" || !takesChild(container.node)) return null;

    return isEditable(editing, container.node.id) ? container.key : null;
  }

  /** Applies the edit key of `event` to `row`. Returns `true` if the key was an edit key. */
  function editKey(event: KeyboardEvent<HTMLDivElement>, row: EventRow): boolean {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plain && (event.key === "F2" || event.key === "Enter")) {
      if (row.kind === "field") {
        if (editing !== null && row.field.editable) setEntering(row.key);
        return true;
      }

      const container = row.kind === "children" ? pickerOf(row) : null;
      if (container !== null) {
        onAdding?.(container);
        return true;
      }
      if (event.key === "F2") return true;
    }
    if (editing === null) return false;

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      const container = pickerOf(row);
      if (container !== null) onAdding?.(container);
      return true;
    }

    const container = containerOf(parentOf(row));
    const child = rowObject(row);
    const removable = container !== null && child !== null && isEditable(editing, container.id);
    if (event.key === "Delete" && removable) {
      void editing.edit({ kind: "removeChild", container: container.id, child });
      return true;
    }

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

    const target = movedIndex(event.key, selectedIndex, rows.length);
    if (target !== null) {
      event.preventDefault();
      selectAt(target);
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

  function line(row: EventRow): ReactNode {
    const open = expanded.has(row.key);
    const frame = {
      row,
      open,
      selected: row.key === selected,
      playing: player.playing === row.key,
      blocks: guideBlocks(row, byKey),
      onSelect: () => onSelect(row.key),
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
          <FieldNameCell name={fieldName(row)} lead={<Lead {...frame} expandable={false} />} />
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
      const container = pickerOf(row);
      const picking = editing !== null && adding !== null && adding === row.parent;
      return (
        <RowFrame {...frame}>
          <FieldNameCell name={fieldName(row)} lead={<Lead {...frame} expandable />} />
          {!picking && (
            <ChildrenValue
              count={row.count}
              onAdd={container === null ? undefined : () => onAdding?.(container)}
            />
          )}
          {picking && (
            <NodePicker
              revision={editing.revision}
              exclude={new Set([row.node.id, ...childIds(row.node)])}
              onPick={(child) => {
                void editing.edit({ kind: "addChild", container: row.node.id, child });
                closePicker();
              }}
              onClose={closePicker}
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
            onSelect(row.key);
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
            onAct={() => void editing.edit({ kind: "removeChild", container: container.id, child })}
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
                    onSelect(row.key);
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
