import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRemeasure, useZoomedPx } from "@/hooks";
import { m } from "@/i18n";
import { toggledIn } from "@/utils";

import { steppedRow, useActiveRow } from "../../../shared/hooks/useActiveRow";
import { instantScroll } from "../../../shared/utils/instantScroll";
import { isCollapseAllKey } from "../../../shared/utils/treeGestures";
import { Notice } from "../../shared/preview/Notice";
import { ROW_HEIGHT } from "../../tree/components/BinRow";
import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import {
  filtering,
  isHidden,
  kindCounts,
  type OutlineFilter,
  type OutlineRow,
  outlineRows,
  placedItems,
} from "../utils/mapOutline";
import { modeOf, type SelectMode } from "../utils/mapSelection";
import { OutlinerRow } from "./OutlinerRow";
import { OutlinerSearch } from "./OutlinerSearch";
import { SelectionBar } from "./SelectionBar";

const NONE: ReadonlySet<string> = new Set();

/**
 * A map's chunk graph as a tree: each chunk of its `.materials.bin`, and what each holds.
 *
 * A search box over the tree narrows it to the placeables whose name or class holds the text,
 * or whose chunk's name does, and a chip per kind keeps only that kind. A narrowed chunk opens
 * on its own. A row sends the camera to where its placeable stands, and an eye hides a chunk
 * or one placeable from the scene, only what the scene draws having one.
 *
 * The tree is one tab stop: Up and Down walk the rows, Right opens a chunk or steps into it,
 * Left closes it or steps out to it, Enter or Space acts on the row, and Ctrl+F returns to the
 * box. A click on a placeable selects it and flies to it, Shift adds it to the selection and
 * Ctrl flips it, Ctrl+A selects every placeable listed and Escape lets go, the same selection
 * the viewport's box tool makes. The rows are virtual, since one chunk of Summoner's Rift
 * holds a thousand.
 */
export function MapOutliner({ collapseAllSignal = 0 }: MapOutlinerProps) {
  const {
    materials,
    chosen,
    variants,
    failed,
    hidden,
    setHidden,
    focus,
    focusOn,
    filter,
    setFilter,
    selected,
    lead,
    select,
  } = useMapScene();
  const outline = useQuery(mapQueries.outline(materials));
  const chunks = outline.data;
  const [opened, setOpened] = useState<ReadonlySet<string>>(NONE);
  /* The chunks the reader shut under the current filter, where a chunk opens by default. */
  const [shut, setShut] = useState<ReadonlySet<string>>(NONE);
  const narrowed = filtering(filter);
  const rows = useMemo(
    () => outlineRows(chunks ?? [], opened, filter, shut),
    [chunks, opened, filter, shut],
  );
  const counts = useMemo(() => kindCounts(chunks ?? []), [chunks]);
  const matches = narrowed ? shownCount(rows) : null;

  const changeFilter = useCallback(
    (next: OutlineFilter) => {
      setFilter(next);
      setShut(NONE);
    },
    [setFilter],
  );

  const toggle = useCallback(
    (chunk: string) => {
      const flip = (held: ReadonlySet<string>) => toggledIn(held, chunk);
      if (narrowed) setShut(flip);
      else setOpened(flip);
    },
    [narrowed],
  );

  const collapseAll = useCallback(() => {
    if (narrowed) setShut(new Set((chunks ?? []).map((chunk) => chunk.entry)));
    else setOpened((current) => (current.size === 0 ? current : NONE));
  }, [narrowed, chunks]);

  const collapsedFor = useRef(collapseAllSignal);
  useEffect(() => {
    if (collapseAllSignal === collapsedFor.current) return;
    collapsedFor.current = collapseAllSignal;
    collapseAll();
  }, [collapseAllSignal, collapseAll]);

  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const zoomed = useZoomedPx();
  const rowHeight = zoomed(ROW_HEIGHT);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: useCallback((index: number) => rows[index]?.id ?? index, [rows]),
    scrollToFn: instantScroll,
  });
  useRemeasure(virtualizer, rowHeight);

  const { active, setActiveId, stepTo, reveal, domId, activeDescendant, isActive } = useActiveRow(
    rows,
    virtualizer,
  );

  /* A pick made anywhere, the viewport's box included, opens its chunk and scrolls the tree to
     it once the row stands. */
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (lead === null || lead === revealed.current || !selected.has(lead)) return;
    revealed.current = lead;
    reveal(lead);

    const chunk = lead.slice(0, lead.indexOf("/"));
    if (narrowed) setShut((held) => (held.has(chunk) ? without(held, chunk) : held));
    else setOpened((held) => (held.has(chunk) ? held : new Set([...held, chunk])));
  }, [lead, selected, narrowed, reveal]);

  /* A plain pick selects the placeable alone and flies to it, and a modified one edits the
     selection in place. */
  const act = (row: OutlineRow, mode: SelectMode = "replace") => {
    setActiveId(row.id);
    if (row.type === "chunk") {
      toggle(row.chunk.entry);
      return;
    }
    select([row.id], mode);
    if (mode === "replace") {
      focusOn({ id: row.id, position: row.item.position as [number, number, number] });
    }
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isCollapseAllKey(event)) {
      event.preventDefault();
      collapseAll();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      select(
        placedItems(chunks ?? [], filter).map((each) => each.id),
        "replace",
      );
      return;
    }
    if (event.key === "Escape" && selected.size > 0) {
      event.preventDefault();
      select([], "replace");
      return;
    }

    const row = rows[active];
    if (row === undefined) return;

    const page = virtualizer.getVirtualItems().length;
    const step = navigation(event.key, row, active, rows, page);
    if (step === null) return;

    event.preventDefault();
    if (step === "act") act(row);
    else if (step === "toggle" && row.type === "chunk") toggle(row.chunk.entry);
    else if (typeof step === "number") stepTo(step);
  }

  if (failed || outline.error !== null) {
    return <Notice text={m.workshop_bin_map_preview_failed_empty()} />;
  }
  if (variants !== undefined && chosen === null) {
    return <Notice text={m.workshop_bin_map_preview_missing_empty()} />;
  }
  if (chunks === undefined) return <Notice text={m.workshop_bin_map_outliner_loading_label()} />;
  if (chunks.length === 0) return <Notice text={m.workshop_bin_map_outliner_empty()} />;

  return (
    <div data-ui="MapOutliner" className="flex min-h-0 flex-1 flex-col select-none">
      <OutlinerSearch
        filter={filter}
        onChange={changeFilter}
        counts={counts}
        matches={matches}
        inputRef={search}
        onLeave={() => scroller.current?.focus()}
      />
      <SelectionBar chunks={chunks} />
      {rows.length === 0 && <Notice text={m.workshop_bin_map_outliner_no_match_empty()} />}
      <div
        ref={scroller}
        role="tree"
        tabIndex={0}
        aria-label={m.workshop_bin_pane_outliner_label()}
        aria-activedescendant={activeDescendant}
        /* DS-SCROLLBAR */
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 font-mono text-mono-row outline-none scrollbar-md"
        onKeyDown={handleKeyDown}
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtual) => {
            const row = rows[virtual.index];
            if (row === undefined) return null;

            const rowIsHidden = rowHidden(row, hidden);
            return (
              <div
                key={virtual.key}
                className="absolute top-0 left-0 w-full"
                style={{ height: virtual.size, transform: `translateY(${virtual.start}px)` }}
              >
                <OutlinerRow
                  domId={domId(virtual.index)}
                  row={row}
                  hidden={rowIsHidden}
                  focused={row.type === "item" && focus?.id === row.id}
                  selected={selected.has(row.id)}
                  active={isActive(virtual.index)}
                  query={filter.text}
                  narrowed={narrowed}
                  onActivate={(event) => act(row, modeOf(event))}
                  onHide={() => setHidden(row.id, !rowIsHidden)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface MapOutlinerProps {
  /** A count the header's collapse-all button raises, which collapses every open chunk. */
  readonly collapseAllSignal?: number;
}

function rowHidden(row: OutlineRow, hidden: ReadonlySet<string>): boolean {
  return row.type === "chunk"
    ? hidden.has(row.chunk.entry)
    : isHidden(hidden, row.chunk.entry, row.item.key);
}

function without(held: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(held);
  next.delete(id);
  return next;
}

/** How many placeables the narrowed chunks keep between them. */
function shownCount(rows: readonly OutlineRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.type === "chunk") total += row.shown;
  }
  return total;
}

/**
 * What a key asks of the tree from the row at `at`: a row to move to, a chunk to fold, the
 * row's own action, or nothing. `page` is how many rows a Page key moves.
 */
function navigation(
  key: string,
  row: OutlineRow,
  at: number,
  rows: readonly OutlineRow[],
  page: number,
): number | "toggle" | "act" | null {
  const stepped = steppedRow(key, at, rows.length, page);
  if (stepped !== null) return stepped;

  switch (key) {
    case "Enter":
    case " ":
      return "act";
    case "ArrowRight":
      if (row.type !== "chunk") return null;
      return row.open ? at + 1 : "toggle";
    case "ArrowLeft":
      if (row.type === "chunk") return row.open ? "toggle" : null;
      return rows.findIndex((each) => each.type === "chunk" && each.chunk === row.chunk);
    default:
      return null;
  }
}
