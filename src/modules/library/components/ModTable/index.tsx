import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PickContext, useArrangedColumns, useRowPicks } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod, LibraryFolder } from "@/lib/tauri";
import { useChampionRoster } from "@/modules/champions";
import {
  useEffectiveCategories,
  useFilteredMods,
  useFolderOrder,
  useFolders,
  useModHealthVerdicts,
} from "@/modules/library/api";
import { sortFolders } from "@/modules/library/utils";
import { twMerge } from "@/utils";

import {
  TABLE_COLUMNS,
  useHasActiveFilters,
  useLibrarySelectionStore,
  useLibrarySidebarStore,
  useLibrarySort,
  useLibraryTableStore,
  useLibraryViewStore,
} from "../../state";
import { COLUMN_SPECS, ROW_HEIGHT } from "./columns";
import { DockSash } from "./DockSash";
import { GROUP_ROW_HEIGHT, GroupRow } from "./GroupRow";
import { HEADER_HEIGHT, ModTableHeader } from "./ModTableHeader";
import { ModTableRow } from "./ModTableRow";
import { RowDragGhost } from "./RowDragGhost";
import { buildTableRows, orderedModIds, type TableRow } from "./rows";
import { useRowDrag } from "./useRowDrag";
import { useRowPreview } from "./useRowPreview";

/** Rows to keep mounted past each edge, so a fast scroll lands on drawn rows. */
const OVERSCAN = 8;

const ROOT_FOLDER_ID = "root";

/** Space between the frame and the rows on each side, in pixels. */
const GUTTER = 8;

/** Space between the header and the first row, in pixels. */
const ROWS_TOP = 4;

/** Where the rows start, below the header and the space under it. */
const ROWS_OFFSET = HEADER_HEIGHT + ROWS_TOP;

const modOf = (row: TableRow) => (row.type === "mod" ? row.mod.id : null);
const selection = () => useLibrarySelectionStore.getState();

interface ModTableProps {
  mods: InstalledMod[];
  searchQuery: string;
  folderId?: string;
}

/**
 * The library as a table: one row per mod, in columns the reader arranges.
 *
 * Row order, search, filters and sort come from the same stores the grid reads.
 * The table adds grouping, the current row and the pointer-driven preview in the
 * dock. Per "Table view" in docs/ux/LIBRARY.md.
 */
export function ModTable({ mods, searchQuery, folderId }: ModTableProps) {
  const filtered = useFilteredMods(mods, searchQuery);
  const hasActiveFilters = useHasActiveFilters();
  const sort = useLibrarySort();
  const { data: folders } = useFolders();
  const { data: folderOrder } = useFolderOrder();
  const { data: verdicts } = useModHealthVerdicts();
  const effective = useEffectiveCategories(mods);
  const roster = useChampionRoster();
  const expandedFolders = useLibraryViewStore((s) => s.expandedFolders);
  const toggleFolderExpanded = useLibraryViewStore((s) => s.toggleFolderExpanded);

  const density = useLibraryTableStore((s) => s.density);
  const storedGroupBy = useLibraryTableStore((s) => s.groupBy);
  const collapsedGroups = useLibraryTableStore((s) => s.collapsedGroups);
  const toggleGroupCollapsed = useLibraryTableStore((s) => s.toggleGroupCollapsed);
  const dockOpen = !useLibraryTableStore((s) => s.dockCollapsed);

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const shownId = useLibrarySidebarStore((s) => s.modId);
  const held = useLibrarySidebarStore((s) => s.pinned || s.editing || s.dirty);
  const { preview, onEnter, onPointerMove, onPointerLeave } = useRowPreview(setCurrentKey);
  const selectedIds = useLibrarySelectionStore((s) => s.selectedIds);
  const hasSelection = selectedIds.size > 0;
  const setOrderedIds = useLibrarySelectionStore((s) => s.setOrderedIds);

  const drilldown = folderId !== undefined && folderId !== ROOT_FOLDER_ID;
  const groupBy = drilldown && storedGroupBy === "folder" ? "none" : storedGroupBy;
  const narrowed = searchQuery.length > 0 || hasActiveFilters;

  const positions = useMemo(() => new Map(mods.map((mod, index) => [mod.id, index + 1])), [mods]);

  const orderedFolders = useMemo(() => {
    const byId = new Map((folders ?? []).map((folder) => [folder.id, folder]));
    const ordered = (folderOrder ?? [])
      .filter((id) => id !== ROOT_FOLDER_ID)
      .map((id) => byId.get(id))
      .filter((folder): folder is LibraryFolder => folder !== undefined);
    return sortFolders(ordered, sort);
  }, [folders, folderOrder, sort]);

  const rows = useMemo(() => {
    const drawn = drilldown ? filtered.filter((mod) => mod.folderId === folderId) : filtered;
    return buildTableRows({
      mods: drawn,
      groupBy,
      folders: orderedFolders,
      expandedFolders,
      collapsedGroups,
      narrowed,
      context: { roster, effective, verdicts, now: new Date() },
    });
  }, [
    drilldown,
    filtered,
    folderId,
    groupBy,
    orderedFolders,
    expandedFolders,
    collapsedGroups,
    narrowed,
    roster,
    effective,
    verdicts,
  ]);

  const modIds = useMemo(() => orderedModIds(rows), [rows]);
  useEffect(() => {
    setOrderedIds(modIds);
  }, [modIds, setOrderedIds]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const {
    columns: specs,
    headerColumns,
    totalWidth,
    style: columnStyle,
    moveColumn,
  } = useArrangedColumns({
    columns: TABLE_COLUMNS,
    specs: COLUMN_SPECS,
    store: useLibraryTableStore,
    scrollerRef,
    gutter: GUTTER,
  });

  /* ---- Rows ---- */

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) =>
      rows[index].type === "group" ? GROUP_ROW_HEIGHT : ROW_HEIGHT[density],
    getItemKey: (index) => rows[index].key,
    overscan: OVERSCAN,
    scrollMargin: ROWS_OFFSET,
    scrollPaddingStart: ROWS_OFFSET,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [density, virtualizer]);

  /* ---- Current row and preview ---- */

  const currentIndex = rows.findIndex((row) => row.key === currentKey);
  const current = rows[currentIndex];

  /* The current row is the dock's mod. It follows the dock when something else
     changes it, and finds that mod again after a regroup changes every key. A
     table with rows and an empty dock starts on the first row. */
  useEffect(() => {
    if (current?.type === "mod" && (held || shownId === null || current.mod.id === shownId)) {
      return;
    }
    if (current?.type === "group") return;

    const wanted = shownId ?? currentKey?.split("|").pop();
    const next =
      rows.find((row) => row.type === "mod" && row.mod.id === wanted) ??
      rows.find((row) => row.type === "mod");
    if (next?.type !== "mod") return;

    setCurrentKey(next.key);
    preview(next.mod.id);
  }, [rows, current, currentKey, shownId, held, preview]);

  const { anchor, pick, rangeTo, startPick, paintOver } = useRowPicks(rows, modOf, selection);

  const canReorder =
    sort.field === "priority" &&
    !narrowed &&
    !hasSelection &&
    (groupBy === "folder" || groupBy === "none");
  const rowDrag = useRowDrag({
    rows,
    mods,
    enabled: canReorder,
    crossFolders: groupBy === "folder",
    scrollerRef,
    virtualizer,
    topInset: HEADER_HEIGHT,
  });
  const { drag, consumeClick, isDragging } = rowDrag;
  const drop = drag?.drop;

  /* Only a drawn row holds its switch, so Space on a row scrolled out of view
     brings it back and presses it once it registers. */
  const toggles = useRef(new Map<string, () => void>());
  const pendingToggle = useRef<string | null>(null);
  const register = useCallback((rowKey: string, toggle: (() => void) | null) => {
    if (!toggle) {
      toggles.current.delete(rowKey);
      return;
    }

    toggles.current.set(rowKey, toggle);
    if (pendingToggle.current === rowKey) {
      pendingToggle.current = null;
      toggle();
    }
  }, []);

  const onPress = useCallback(
    (event: React.MouseEvent, rowKey: string, modId: string) => {
      if (consumeClick()) return;
      scrollerRef.current?.focus({ preventScroll: true });
      if (event.shiftKey) {
        rangeTo(rowKey, modId);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        pick(rowKey, modId);
        return;
      }
      setCurrentKey(rowKey);
      preview(modId);
      toggles.current.get(rowKey)?.();
    },
    [consumeClick, pick, rangeTo, preview],
  );

  const onRowEnter = useCallback(
    (rowKey: string, modId: string, buttons: number) => {
      if (paintOver(rowKey, buttons) || isDragging()) return;
      onEnter(rowKey, modId);
    },
    [paintOver, isDragging, onEnter],
  );

  const onPickStart = useCallback(
    (event: React.PointerEvent, rowKey: string, modId: string, selected: boolean) => {
      scrollerRef.current?.focus({ preventScroll: true });
      startPick(event, rowKey, modId, selected);
    },
    [startPick],
  );

  const isPicked = (index: number) => {
    const row = rows[index];
    return row?.type === "mod" && selectedIds.has(row.mod.id);
  };

  const toggleGroup = useCallback(
    (rowKey: string) => {
      if (narrowed) return;
      if (rowKey.startsWith("folder:")) {
        toggleFolderExpanded(rowKey.slice("folder:".length));
        return;
      }
      toggleGroupCollapsed(rowKey);
    },
    [narrowed, toggleFolderExpanded, toggleGroupCollapsed],
  );

  const onGroupPress = useCallback(
    (rowKey: string) => {
      setCurrentKey(rowKey);
      toggleGroup(rowKey);
      scrollerRef.current?.focus({ preventScroll: true });
    },
    [toggleGroup],
  );

  function moveCursor(index: number, extend: boolean) {
    const row = rows[index];
    if (!row) return;

    setCurrentKey(row.key);
    virtualizer.scrollToIndex(index, { align: "auto" });
    if (row.type !== "mod") return;

    preview(row.mod.id);
    if (!extend) {
      anchor(row.key, row.mod.id);
      return;
    }

    if (useLibrarySelectionStore.getState().anchorId === null && current?.type === "mod") {
      anchor(current.key, current.mod.id);
    }
    rangeTo(row.key, row.mod.id);
  }

  function toggleCurrent(rowKey: string) {
    virtualizer.scrollToIndex(currentIndex, { align: "auto" });

    const toggle = toggles.current.get(rowKey);
    if (toggle) {
      toggle();
      return;
    }
    pendingToggle.current = rowKey;
  }

  /* A row's own control keeps Space and Enter, and the arrows leave it for the
     table. A key from a menu or popover arrives through the portal and is theirs. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const grid = event.currentTarget;
    const target = event.target as HTMLElement;
    if (!grid.contains(target) || target.closest("input, textarea, [contenteditable]")) return;
    if (rows.length === 0) return;

    const onControl = target !== grid && target.closest("button, a, [role=switch]") !== null;

    const page = Math.max(
      1,
      Math.floor(event.currentTarget.clientHeight / ROW_HEIGHT[density]) - 1,
    );
    const last = rows.length - 1;
    const steps: Record<string, number> = {
      ArrowDown: Math.min(last, currentIndex + 1),
      ArrowUp: Math.max(0, currentIndex - 1),
      PageDown: Math.min(last, currentIndex + page),
      PageUp: Math.max(0, currentIndex - page),
      Home: 0,
      End: last,
    };

    if (event.key in steps) {
      event.preventDefault();
      if (onControl) grid.focus({ preventScroll: true });
      moveCursor(currentIndex === -1 ? 0 : steps[event.key], event.shiftKey);
      return;
    }

    if (!current || onControl) return;

    if (current.type === "group") {
      const opens = event.key === "ArrowRight" && !current.expanded;
      const closes = event.key === "ArrowLeft" && current.expanded;
      if (opens || closes || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggleGroup(current.key);
      }
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        pick(current.key, current.mod.id);
        return;
      }
      toggleCurrent(current.key);
    }
  }

  return (
    <div
      ref={scrollerRef}
      role="grid"
      tabIndex={0}
      aria-label={m.library_table_label()}
      aria-rowcount={rows.length + 1}
      aria-colcount={specs.length}
      data-ui="ModTable"
      onKeyDown={handleKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={columnStyle}
      className={twMerge(
        "group/table relative min-h-0 flex-1 overflow-auto outline-none scrollbar-md",
        drag && "cursor-grabbing [&_*]:cursor-grabbing",
      )}
    >
      {/* Room under the last row while the selection bar floats over it. */}
      <div
        style={{
          width: totalWidth + 2 * GUTTER,
          minWidth: "100%",
          paddingBottom: hasSelection ? 112 : GUTTER,
        }}
      >
        <ModTableHeader columns={headerColumns} modIds={modIds} onMoveColumn={moveColumn} />
        <PickContext value={onPickStart}>
          <div
            role="rowgroup"
            style={{ height: virtualizer.getTotalSize(), marginTop: ROWS_TOP }}
            className="relative mx-2"
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row: TableRow = rows[item.index];
              const top = item.start - ROWS_OFFSET;

              if (row.type === "group") {
                return (
                  <GroupRow
                    key={row.key}
                    row={row}
                    groupBy={groupBy}
                    columns={specs}
                    isCurrent={row.key === currentKey}
                    narrowed={narrowed}
                    isDropTarget={drop?.kind === "into" && drop.rowKey === row.key}
                    top={top}
                    onPress={onGroupPress}
                    onToggle={toggleGroup}
                  />
                );
              }

              return (
                <ModTableRow
                  key={row.key}
                  mod={row.mod}
                  rowKey={row.key}
                  columns={specs}
                  position={positions.get(row.mod.id) ?? 0}
                  density={density}
                  isCurrent={row.key === currentKey}
                  joinTop={isPicked(item.index) && isPicked(item.index - 1)}
                  joinBottom={isPicked(item.index) && isPicked(item.index + 1)}
                  top={top}
                  height={item.size}
                  onPress={onPress}
                  onEnter={onRowEnter}
                  register={register}
                  onDragStart={rowDrag.onRowPointerDown}
                  isDragged={drag?.modId === row.mod.id}
                />
              );
            })}
            {drop?.kind === "beside" && (
              <span
                aria-hidden="true"
                style={{ top: drop.line - ROWS_OFFSET - 1 }}
                className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 rounded-full bg-accent-400"
              />
            )}
          </div>
        </PickContext>
        {drag && <RowDragGhost drag={drag} />}
        {dockOpen && <DockSash scrollerRef={scrollerRef} gutter={GUTTER} shownId={shownId} />}
      </div>
    </div>
  );
}
