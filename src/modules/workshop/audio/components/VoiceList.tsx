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

import { Button, ContextMenu } from "@/components";
import { NO_OVERSCROLL, useRemeasure, useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import type { MediaLocation, SetFile } from "@/lib/tauri";
import { measureRow, twMerge } from "@/utils";

import { nameColumnStyle, RowAction } from "../../shared/components/PropertyRowParts";
import { createGuideStore, GuideStoreContext } from "../../shared/state/treeGuides";
import { instantScroll } from "../../shared/utils/instantScroll";
import type { EventPlayer } from "../hooks/useEventPlayer";
import { movedIndex, treeStep } from "../utils/rowKeys";
import { childIds, isEditable, type TreeEditing } from "../utils/treeEditing";
import {
  type FieldCell,
  movedCell,
  segmentKey,
  takesMediaPick,
  type VoiceCell,
  voiceCells,
  type VoiceLine,
  voiceLine,
  voiceParent,
  type VoiceRow,
} from "../utils/voices";
import { AUDIO_LIST_GROUP } from "./audioRow";
import { EditedMark, guideBlocks, Lead, PlayButton, RowFrame, rowId } from "./EventRowParts";
import { FieldNameCell, FieldValue, NodePicker } from "./FieldRows";
import { EventContent, Status } from "./RowContent";
import {
  AddVariation,
  ChainLine,
  MediaPicker,
  VoiceCells,
  VoiceName,
  voiceNameColumns,
} from "./VoiceRowParts";

interface VoiceListProps {
  readonly rows: readonly VoiceRow[];
  readonly expanded: ReadonlySet<string>;
  readonly onExpand: (key: string, open: boolean) => void;
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  readonly player: EventPlayer;
  /** Plays a new pick of `row`, and stops what played before. */
  readonly onPlay: (row: VoiceRow) => void;
  /** Plays once what an edit on `row` changed. */
  readonly onReplay: (row: VoiceRow) => void;
  /** Plays `media` under the row `key`, and stops what played before. */
  readonly onPreview: (key: string, media: MediaLocation) => void;
  /** Copies the name of an event row, or the ID of the object of any other row. */
  readonly onCopy: (row: VoiceRow) => void;
  /** The context menu items of `row`. */
  readonly menu: (row: VoiceRow) => ReactNode;
  /** The waveform column of `row`. */
  readonly thumbnail: (row: VoiceRow) => ReactNode;
  /** The open document that the rows edit, or null for a view that takes no edit. */
  readonly editing: TreeEditing | null;
  /** The files of the bank set, which the media picker lists the media of. */
  readonly files: readonly SetFile[];
  /** Shows the Structure view. */
  readonly onStructure: () => void;
}

/** The height of a row in px at 100% zoom: `min-h-6` is six spacing units of 4.5px. */
const ROW_HEIGHT = 27;

/** Returns `true` if the source of the voice of `line` takes a pick of another media. */
function swappable(line: VoiceLine, editing: TreeEditing | null): boolean {
  return editing !== null && takesMediaPick(line);
}

/**
 * The events of an event bank, each expanding into the voices it can play, windowed.
 *
 * An expanded event draws one chain line per Play action, whose presses open the fields of the
 * action and its containers, then a row per voice with its knobs, a fold of the other switch
 * branches and the add row. One tab stop with `aria-activedescendant`. Up and Down move between
 * rows, Left and Right between the cells of a voice row, and Enter or F2 opens the entry of the
 * cell. Per "Voices" in docs/ux/AUDIO.md.
 */
export function VoiceList({
  rows,
  expanded,
  onExpand,
  selected,
  onSelect,
  player,
  onPlay,
  onReplay,
  onPreview,
  onCopy,
  menu,
  thumbnail,
  editing,
  files,
  onStructure,
}: VoiceListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const byKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
  const nameCols = useMemo(() => voiceNameColumns(rows), [rows]);
  const [guides] = useState(createGuideStore);
  const [entering, setEntering] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [cellName, setCellName] = useState<VoiceCell>("media");
  const [segmentAt, setSegmentAt] = useState(0);
  const [menuRow, setMenuRow] = useState<VoiceRow | null>(null);

  /* A field that commits or drops its text leaves focus on no element, and the list takes it
     back, so a run of edits stays on the keyboard. */
  function returnFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active === null || active === document.body) scroller.current?.focus();
    });
  }

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

  function cellsOf(row: VoiceRow | undefined): VoiceCell[] {
    const line = voiceLine(row);
    return line === null ? [] : voiceCells(line.fields, line.columns);
  }

  /** Returns the cell that the arrows reached on `row`: the last one named, else the first. */
  function activeCell(row: VoiceRow | undefined): VoiceCell | null {
    const cells = cellsOf(row);
    return cells.includes(cellName) ? cellName : (cells[0] ?? null);
  }

  /** Returns the objects of the presses of a chain row, the Play first. */
  function pressesOf(row: VoiceRow): number[] {
    if (row.kind !== "chain") return [];

    return row.segments.flatMap((segment) => {
      if (segment.kind === "play") return [segment.action.id];
      if (segment.kind === "container") return [segment.container.id];
      return [];
    });
  }

  function togglePress(row: VoiceRow, id: number) {
    const key = segmentKey(row.key, id);
    onExpand(key, !expanded.has(key));
  }

  function enterCell(row: VoiceRow, cell: VoiceCell): boolean {
    const line = voiceLine(row);
    if (line === null) return false;

    if (cell === "media") {
      if (!swappable(line, editing)) return false;

      setPicking(row.key);
      return true;
    }

    const field = line.fields.cells[cell];
    if (editing === null || field?.editable !== true) return false;

    setEntering(`${row.key}:${cell}`);
    return true;
  }

  /** Returns the container that the voice of `row` sits in, if it takes edits there. */
  function editableParent(row: VoiceRow) {
    const parent = row.kind === "voice" ? voiceParent(row.line.voice) : null;
    return parent !== null && isEditable(editing, parent.id) ? parent : null;
  }

  function removeVoice(row: VoiceRow) {
    const parent = editableParent(row);
    if (editing === null || parent === null || row.kind !== "voice") return;

    void editing.edit({ kind: "delete", object: row.line.voice.node.id, parent: parent.id });
  }

  /** Applies the edit key of `event` to `row`. Returns `true` if the key was an edit key. */
  function editKey(event: KeyboardEvent<HTMLDivElement>, row: VoiceRow): boolean {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plain && (event.key === "F2" || event.key === "Enter")) {
      const cell = activeCell(row);
      if (cell !== null) return enterCell(row, cell) || event.key === "F2";

      if (row.kind === "field") {
        if (editing !== null && row.field.editable) setEntering(row.key);
        return true;
      }
      const presses = pressesOf(row);
      const press = presses[Math.min(segmentAt, presses.length - 1)];
      if (press !== undefined) {
        togglePress(row, press);
        return true;
      }
      if (row.kind === "add") {
        setAdding(row.key);
        return true;
      }
      if (row.kind === "others") {
        onExpand(row.key, !expanded.has(row.key));
        return true;
      }
      if (row.kind === "empty") {
        onStructure();
        return true;
      }
      if (event.key === "F2") return true;
    }

    const parent = editableParent(row);
    if (event.key === "Delete" && parent !== null) {
      removeVoice(row);
      return true;
    }

    const moving = event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown");
    if (moving && parent !== null && editing !== null && row.kind === "voice") {
      if (parent.kind !== "random") return true;

      const child = row.line.voice.node.id;
      const at = parent.playlist.findIndex((item) => parent.children[item.child]?.id === child);
      const index = at + (event.key === "ArrowUp" ? -1 : 1);
      if (at >= 0 && index >= 0 && index < parent.playlist.length) {
        void editing.edit({ kind: "moveChild", container: parent.id, child, index });
      }
      return true;
    }
    return false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    const row = selectedRow;
    if (row !== undefined && editKey(event, row)) {
      event.preventDefault();
      return;
    }

    const target = movedIndex(event.key, selectedIndex, rows.length);
    if (target !== null) {
      event.preventDefault();
      selectAt(target);
      return;
    }

    if (row === undefined) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const cells = cellsOf(row);
      const at = cells.indexOf(activeCell(row) ?? "media");
      const next = cells.length > 1 ? movedCell(event.key, at, cells.length) : null;
      const cell = next === null ? undefined : cells[next];
      if (cell !== undefined) {
        setCellName(cell);
        return;
      }

      const presses = pressesOf(row).length;
      const press =
        presses > 1 ? movedCell(event.key, Math.min(segmentAt, presses - 1), presses) : null;
      if (press !== null) {
        setSegmentAt(press);
        return;
      }

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

  function closeAdding() {
    setAdding(null);
    returnFocus();
  }

  function closePicking() {
    setPicking(null);
    returnFocus();
  }

  function enterChange(key: string, open: boolean) {
    setEntering((current) => (open ? key : current === key ? null : current));
  }

  function voiceParts(row: VoiceRow, line: VoiceLine) {
    const isSelected = row.key === selected;
    const active = isSelected ? activeCell(row) : null;
    const node = line.voice.node;
    const enteringCell = entering?.startsWith(`${row.key}:`)
      ? (entering.slice(row.key.length + 1) as FieldCell)
      : null;
    const picker =
      picking === row.key && editing !== null && node.kind === "sound" ? (
        <MediaPicker
          files={files}
          line={line}
          onPreview={(candidate) => onPreview(row.key, candidate.media)}
          onPick={(candidate) => {
            void editing
              .edit({ kind: "source", sound: node.id, source: candidate.media.source })
              .then((applied) => {
                if (applied) onPreview(row.key, candidate.media);
              });
            closePicking();
          }}
          onClose={closePicking}
        />
      ) : null;

    return {
      active,
      picker,
      onSwap: swappable(line, editing) ? () => setPicking(row.key) : undefined,
      cells: (
        <VoiceCells
          line={line}
          editing={editing}
          entering={enteringCell}
          onEntering={(cell, open) => enterChange(`${row.key}:${cell}`, open)}
          onLeave={returnFocus}
          onCommitted={() => onReplay(row)}
          active={active}
        />
      ),
    };
  }

  function line(row: VoiceRow): ReactNode {
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
    const lead = <Lead {...frame} expandable={row.expandable} />;
    const play = (playable: boolean) => (
      <PlayButton
        playable={playable}
        playing={frame.playing}
        onToggle={() => {
          onSelect(row.key);
          if (player.playing === row.key) player.stop();
          else onPlay(row);
        }}
      />
    );
    const failed = player.failed.has(row.key) && (
      <span className="text-meta text-danger-text">{m.audio_event_play_failed_label()}</span>
    );

    switch (row.kind) {
      case "event": {
        const inline = row.inline;
        const parts = inline === null ? null : voiceParts(row, inline);
        return (
          <RowFrame {...frame}>
            {lead}
            {play(row.event.mediaCount > 0)}
            <EventContent event={row.event} />
            {inline !== null && parts !== null && (
              <>
                <VoiceName
                  line={inline}
                  prefix={[]}
                  lead={null}
                  column={false}
                  active={parts.active === "media"}
                  picker={parts.picker}
                  onSwap={parts.onSwap}
                />
                {parts.cells}
                {editing !== null && editing.edited.has(inline.voice.node.id) && <EditedMark />}
              </>
            )}
            {failed}
            <span className="ml-auto w-24 shrink-0 pl-3">{thumbnail(row)}</span>
          </RowFrame>
        );
      }
      case "chain":
        return (
          <RowFrame {...frame}>
            {lead}
            <ChainLine
              segments={row.segments}
              isOpen={(id) => expanded.has(segmentKey(row.key, id))}
              onToggle={(id) => togglePress(row, id)}
              active={frame.selected ? Math.min(segmentAt, pressesOf(row).length - 1) : null}
            />
          </RowFrame>
        );
      case "field":
        return (
          <RowFrame
            {...frame}
            onEdit={
              editing !== null && row.field.editable ? () => enterChange(row.key, true) : undefined
            }
          >
            <FieldNameCell name={row.field.name} lead={lead} />
            <FieldValue
              field={row.field}
              editing={editing}
              entering={entering === row.key}
              onEntering={(next) => enterChange(row.key, next)}
              onLeave={returnFocus}
              onCommitted={() => onReplay(row)}
            />
          </RowFrame>
        );
      case "voice": {
        const parts = voiceParts(row, row.line);
        const node = row.line.voice.node;
        const removable = editing !== null && editableParent(row) !== null;
        return (
          <RowFrame {...frame}>
            <VoiceName
              line={row.line}
              prefix={row.prefix}
              lead={
                <>
                  {lead}
                  {play(node.kind === "sound" && node.media !== null)}
                </>
              }
              active={parts.active === "media"}
              picker={parts.picker}
              onSwap={parts.onSwap}
            />
            {parts.cells}
            {editing !== null && editing.edited.has(node.id) && <EditedMark />}
            {removable && (
              <RowAction
                label={m.audio_edit_remove_child_action()}
                icon={MinusCircleIcon}
                onAct={() => removeVoice(row)}
              />
            )}
            {failed}
            <span className="ml-auto w-24 shrink-0 pl-3">{thumbnail(row)}</span>
          </RowFrame>
        );
      }
      case "others":
        return (
          <RowFrame {...frame}>
            {lead}
            <span className="text-meta text-surface-400">
              {m.audio_voices_others_label({ count: row.count })}
            </span>
          </RowFrame>
        );
      case "add":
        return (
          <RowFrame {...frame}>
            {lead}
            {(adding !== row.key || editing === null) && (
              <AddVariation onAdd={() => setAdding(row.key)} />
            )}
            {adding === row.key && editing !== null && (
              <NodePicker
                revision={editing.revision}
                exclude={new Set([row.container.id, ...childIds(row.container)])}
                onPick={(child) => {
                  void editing.edit({ kind: "addChild", container: row.container.id, child });
                  closeAdding();
                }}
                onClose={closeAdding}
              />
            )}
          </RowFrame>
        );
      case "empty":
        return (
          <RowFrame {...frame}>
            {lead}
            <span className="text-meta text-surface-400">{m.audio_voices_empty()}</span>
            <Button
              variant="ghost"
              size="xs"
              tabIndex={-1}
              className="h-5 px-1 text-row font-normal text-surface-300"
              onClick={(event) => {
                event.stopPropagation();
                onStructure();
              }}
            >
              {m.audio_voices_show_structure_action()}
            </Button>
          </RowFrame>
        );
      case "loading":
        return (
          <RowFrame {...frame}>
            {lead}
            <span className="text-meta text-surface-400">{m.audio_event_loading_label()}</span>
          </RowFrame>
        );
      case "failed":
        return (
          <RowFrame {...frame}>
            {lead}
            <Status tone="danger">
              <span className="select-text">{row.message}</span>
            </Status>
          </RowFrame>
        );
    }
  }

  return (
    <GuideStoreContext value={guides}>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          onContextMenuCapture={() => setMenuRow(selectedRow ?? null)}
          ref={scroller}
          role="tree"
          tabIndex={0}
          aria-label={m.audio_voices_tree_label()}
          aria-activedescendant={selected === null ? undefined : rowId(selected)}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            if (event.target === event.currentTarget && selectedIndex < 0) selectAt(0);
          }}
          onPointerLeave={() => guides.set({ hover: null })}
          data-ui="VoiceList"
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
