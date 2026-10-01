import { useVirtualizer } from "@tanstack/react-virtual";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContextMenu } from "@/components";
import { useZoomedPx } from "@/hooks";
import { NO_OVERSCROLL } from "@/hooks/useOverscrollSpring";
import {
  useExplorerTreeArtShape,
  useExplorerTreeRowHeight,
  useExplorerTreeThumbnails,
} from "@/stores";

import { type ExplorerItem, type ExplorerSelectionApi, selectionSubject } from "../../explorer";
import { artBoxFor } from "../../explorer/utils/detailsRow";
import { artSlotWidth, treeArtRequestWidth } from "../../explorer/utils/treeArt";
import { useStickyTreeRows } from "../../hooks";
import { stirImages } from "../../preview/hooks/useImageSlot";
import { TreeStickyBand } from "../../shared/components/TreeStickyBand";
import { createGuideStore, GuideStoreContext } from "../../shared/state/treeGuides";
import { type GameReveal, keepScrollTop, keptScrollTop } from "../../state";
import { type ExtractHow, useExtractActions } from "../extraction/hooks/useExtractActions";
import { type DirTargets, filesUnder, fileTarget } from "../extraction/utils/extractTargets";
import { useSourceTreeNav } from "../hooks/useSourceTreeNav";
import { chunkAsset, useWadSource } from "../state/wadSource";
import type {
  SourceDirNode,
  SourceFileNode,
  SourceRow,
  SourceTreeNode,
} from "../utils/sourceIndex";
import { sourceGuides } from "../utils/sourceIndex";
import { SourceTreeContextMenu } from "./SourceTreeContextMenu";
import { type SourceTreeArt, SourceTreeRow } from "./SourceTreeRow";

/* The layer file tree's fixed row height, so the two trees scan alike. */
const ROW_HEIGHT = 24;

/* The `py-1` above the first row, which the pinned band reads the scroll past. */
const CONTENT_TOP = 4;

interface SourceTreeProps {
  /** The rows to draw, flattened by the caller, which is what an extend runs over. */
  rows: readonly SourceRow[];
  ariaLabel: string;
  isExpanded: (node: SourceDirNode) => boolean;
  onToggle: (node: SourceDirNode) => void;
  /** An Alt+click on a directory's caret. Absent, the caret toggles one level either way. */
  onToggleSubtree?: (node: SourceDirNode) => void;
  /** Collapse every directory, for `Ctrl+Left`. */
  onCollapseAll?: () => void;
  /** A double click on a file row, or its Open menu item. */
  onOpen?: (node: SourceFileNode) => void;
  /** A single click on a file row, which previews it while the setting is on. */
  onPreview?: (node: SourceFileNode) => void;
  /** Names this tree's scroll to the browser store. Absent starts at the top. */
  scrollKey?: string;
  /**
   * How a directory row of this tree becomes targets.
   *
   * The default walks the row's own children, which is right for a tree that
   * holds all of them. The whole-game tree reads a directory when it is first
   * opened, so it passes [`indexDir`](./extractTargets) instead.
   */
  dirTargets?: DirTargets;
  /**
   * The explorer's selection, shared with whatever else draws these items.
   *
   * Absent leaves the tree with a focused row and nothing else, which is what a
   * transient answer such as a search result wants.
   */
  selection?: ExplorerSelectionApi;
  /** What a run against the selection takes, where one is being held. */
  selectionTargets?: () => ReturnType<DirTargets>;
  /** The row this tree is asked to focus, or null while none is owed. */
  reveal?: GameReveal | null;
  /** The reveal with `token` landed, or has no row to land on. */
  onRevealed?: (token: number) => void;
}

/** A read-only virtualized tree over source nodes, from any source index. */
export function SourceTree({
  rows,
  ariaLabel,
  isExpanded,
  onToggle,
  onToggleSubtree,
  onCollapseAll,
  onOpen,
  onPreview,
  scrollKey,
  dirTargets = filesUnder,
  selection,
  selectionTargets,
  reveal = null,
  onRevealed,
}: SourceTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialOffset] = useState(() => (scrollKey ? keptScrollTop(scrollKey) : 0));

  /* The live element rather than one captured at mount, because where it ended
     up is the whole point of reading it here. */
  useEffect(() => {
    if (!scrollKey) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => keepScrollTop(scrollKey, scrollRef.current?.scrollTop ?? 0);
  }, [scrollKey]);

  const isOpenBranch = useCallback(
    (row: SourceRow) => row.node.type === "dir" && isExpanded(row.node),
    [isExpanded],
  );

  const zoomed = useZoomedPx();
  const art = useTreeArt();
  const rowHeight = zoomed(art.height);

  const { sticky, height: stickyHeight } = useStickyTreeRows({
    rows,
    scrollElementRef: scrollRef,
    rowHeight,
    offsetTop: CONTENT_TOP,
    isOpenBranch,
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (index) => rows[index]!.node.id,
    initialOffset,
    /* Everything the tree scrolls to itself clears the pinned band rather than
       landing under it. */
    scrollPaddingStart: stickyHeight,
  });

  /* Sizes cached at the old zoom or row height outlive a change to either:
     `estimateSize` is not one of the inputs the measurement memo watches. */
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  /* Every tree of the browser offers the same ways out, so the routes are read
     here rather than handed down by the three documents that mount one. */
  const { run } = useExtractActions();

  const runNode = useCallback(
    (node: SourceTreeNode, how: ExtractHow) => {
      /* The menu acts on the selection wherever one is held, which is what makes
         a screen of rows into a layer in one gesture. */
      if (selectionTargets && selection && selection.summary.files > 0) {
        run(how, selectionTargets(), selectionSubject(selection));
        return;
      }
      if (node.type === "file") run(how, [fileTarget(node)], node.name);
      if (node.type === "dir") run(how, dirTargets(node), node.name);
    },
    [run, dirTargets, selection, selectionTargets],
  );

  const { focusedIndex, setFocusedIndex, moveFocus, handleKeyDown } = useSourceTreeNav({
    rows,
    isExpanded,
    onToggle,
    onOpen,
    onRun: runNode,
    selection,
    onCollapseAll,
    virtualizer,
    scrollElementRef: scrollRef,
  });

  /* The row lands with the listing that holds it, at its first appearance in
     `rows`. An id no row carries settles with the last loading row. */
  const revealed = useRef<number | null>(null);
  useEffect(() => {
    if (reveal === null || revealed.current === reveal.token) return;
    const index = rows.findIndex((row) => row.node.id === reveal.id);
    if (index < 0 && rows.some((row) => row.node.type === "loading")) return;
    revealed.current = reveal.token;

    const id = index < 0 ? null : idOf(rows[index]!.node);
    if (index >= 0) moveFocus(index);
    /* A tree drawing a selection marks the selected rows and never the focused
       one, so a reveal that only moved the focus would land on nothing a
       reader can see. */
    if (selection && id !== null) selection.select(id, { toggle: false, extend: false });
    onRevealed?.(reveal.token);
  }, [reveal, rows, onRevealed, moveFocus, selection]);

  /* Outside React state, so a pointer crossing the rows redraws the guides and nothing else. */
  const [guides] = useState(createGuideStore);
  const guidesOf = useMemo(() => sourceGuides(rows), [rows]);
  const blockOf = useCallback((index: number) => guidesOf(index).at(-1) ?? null, [guidesOf]);

  useEffect(() => {
    guides.set({ active: blockOf(focusedIndex) });
  }, [guides, blockOf, focusedIndex]);

  function handleMouseOver(event: ReactMouseEvent<HTMLElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-treeitem-index]");
    const index = Number(row?.dataset.treeitemIndex);
    guides.set({ hover: Number.isInteger(index) ? blockOf(index) : null });
  }

  const handleFocusRow = useCallback((index: number) => setFocusedIndex(index), [setFocusedIndex]);

  const handleRowSelect = useCallback(
    (index: number, event?: ReactMouseEvent<HTMLElement>) => {
      setFocusedIndex(index);
      const node = rows[index]?.node;
      if (!selection || !node) return;
      const id = idOf(node);
      if (id === null) return;

      selection.select(id, {
        toggle: event?.ctrlKey === true || event?.metaKey === true,
        extend: event?.shiftKey === true,
      });
    },
    [rows, selection, setFocusedIndex],
  );

  /* A pinned row answers a click by going to the row it stands for. Collapsing
     from up there would shut a directory the user cannot see the extent of. */
  const revealRow = useCallback(
    (index: number) => {
      setFocusedIndex(index);
      virtualizer.scrollToIndex(index, { align: "start" });
    },
    [setFocusedIndex, virtualizer],
  );

  /* One menu for the whole tree, pointed at the row the event came from, the
     same scheme the layer file tree uses. */
  const [menuNode, setMenuNode] = useState<SourceTreeNode | null>(null);

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-treeitem-index]");
    const index = Number(row?.dataset.treeitemIndex);
    if (!Number.isInteger(index)) {
      setMenuNode(null);
      return;
    }

    const node = rows[index]?.node ?? null;
    setMenuNode(node);

    const id = node === null ? null : idOf(node);
    if (selection && id !== null) selection.aimAt(id);
  }

  return (
    <GuideStoreContext value={guides}>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          data-ui="SourceTree"
          ref={scrollRef}
          className="flex-1 overflow-auto text-row outline-none scrollbar-md scrollbar-track"
          role="tree"
          aria-label={ariaLabel}
          aria-multiselectable={selection !== undefined}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          onMouseOver={handleMouseOver}
          onMouseLeave={() => guides.set({ hover: null })}
          onScroll={stirImages}
          {...NO_OVERSCROLL}
        >
          {/* The padding rides inside the scrollport rather than on it: a sticky
            box is confined to its containing block, so the scroll container's
            own padding would hold the band that far below the top edge and let
            rows scroll through the gap above it. */}
          <div className="py-1">
            <TreeStickyBand height={stickyHeight}>
              {sticky.map((pin, slot) => (
                <div
                  key={pin.row.node.id}
                  role="presentation"
                  className="absolute inset-x-0 bg-surface-950"
                  /* Outermost on top, so the innermost row slides away behind it. */
                  style={{ top: `${pin.top}px`, zIndex: sticky.length - slot }}
                >
                  <SourceTreeRow
                    node={pin.row.node}
                    depth={pin.row.depth}
                    isExpanded
                    isSelected={drawsSelected(pin.row.node, pin.index, focusedIndex, selection)}
                    guides={guidesOf(pin.index)}
                    onToggle={() => revealRow(pin.index)}
                    onSelect={handleRowSelect}
                    onFocusRow={handleFocusRow}
                    onOpen={onOpen}
                    onPreview={onPreview}
                    height={rowHeight}
                    rowIndex={pin.index}
                    tabIndex={-1}
                    art={art.row}
                  />
                </div>
              ))}
            </TreeStickyBand>

            <div
              role="presentation"
              data-tree-rows=""
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]!;
                const node = row.node;
                const expanded = node.type === "dir" && isExpanded(node);
                const focused = virtualRow.index === focusedIndex;
                return (
                  <div
                    key={virtualRow.key}
                    role="presentation"
                    className="absolute inset-x-0"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <SourceTreeRow
                      node={node}
                      depth={row.depth}
                      isExpanded={expanded}
                      isSelected={drawsSelected(node, virtualRow.index, focusedIndex, selection)}
                      guides={guidesOf(virtualRow.index)}
                      onToggle={onToggle}
                      onToggleSubtree={onToggleSubtree}
                      onSelect={handleRowSelect}
                      onFocusRow={handleFocusRow}
                      onOpen={onOpen}
                      onPreview={onPreview}
                      height={rowHeight}
                      rowIndex={virtualRow.index}
                      tabIndex={focused ? 0 : -1}
                      art={art.row}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </ContextMenu.Trigger>

        <SourceTreeContextMenu node={menuNode} onOpen={onOpen} onRun={runNode} />
      </ContextMenu.Root>
    </GuideStoreContext>
  );
}

/**
 * The row height and each row's art under the tree's thumbnail setting.
 *
 * Every row takes the thumbnail's height, the directories too, because the pinned band and
 * the virtualizer both place rows at one fixed height.
 */
function useTreeArt(): { height: number; row: SourceTreeArt | null } {
  const thumbnails = useExplorerTreeThumbnails();
  const height = useExplorerTreeRowHeight();
  const shape = useExplorerTreeArtShape();
  const source = useWadSource();
  const zoomed = useZoomedPx();

  return useMemo(() => {
    if (!thumbnails) return { height: ROW_HEIGHT, row: null };

    const box = zoomed(artBoxFor(height));
    const row: SourceTreeArt = {
      box,
      slotWidth: artSlotWidth(box, shape),
      requestWidth: treeArtRequestWidth(height, shape),
      shape,
      assetOf: (item: ExplorerItem) =>
        item.kind === "file" ? chunkAsset(source, item.entry.wad, item.entry.pathHash) : null,
    };
    return { height, row };
  }, [thumbnails, height, shape, source, zoomed]);
}

/** What the selection holds an item by: a directory's path, a file's hash. */
function idOf(node: SourceTreeNode): string | null {
  if (node.type === "dir") return node.path;
  if (node.type === "file") return node.entry.pathHash;
  return null;
}

/**
 * The accent fill reports the selection where there is one, and the focused row
 * where there is not, which is what a tree drew before a selection existed.
 */
function drawsSelected(
  node: SourceTreeNode,
  index: number,
  focusedIndex: number,
  selection?: ExplorerSelectionApi,
): boolean {
  if (!selection) return index === focusedIndex;
  const id = idOf(node);
  return id !== null && selection.isSelected(id);
}
