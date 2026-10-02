import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useZoomedPx } from "@/hooks";
import {
  useExplorerTreeArtShape,
  useExplorerTreeRowHeight,
  useExplorerTreeThumbnails,
} from "@/stores";

import {
  type ExplorerItem,
  type ExplorerSelectionApi,
  handleSelectionKey,
  selectionSubject,
} from "../../explorer";
import { artBoxFor } from "../../explorer/utils/detailsRow";
import { artSlotWidth, treeArtRequestWidth } from "../../explorer/utils/treeArt";
import { type NodeActivation, useBrowseTree, useReadOnlyTreeNav, useTreeReveal } from "../../hooks";
import { stirImages } from "../../preview/hooks/useImageSlot";
import { VirtualTree } from "../../shared/components/VirtualTree";
import { createGuideStore, GuideStoreContext } from "../../shared/state/treeGuides";
import { treeItemIndexOf } from "../../shared/utils/tree";
import type { RowReveal } from "../../state";
import { type ExtractHow, useExtractActions } from "../extraction/hooks/useExtractActions";
import { type DirTargets, filesUnder, fileTarget } from "../extraction/utils/extractTargets";
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
  reveal?: RowReveal | null;
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
  const isOpenBranch = useCallback(
    (row: SourceRow) => row.node.type === "dir" && isExpanded(row.node),
    [isExpanded],
  );

  const zoomed = useZoomedPx();
  const art = useTreeArt();
  const rowHeight = zoomed(art.height);

  const { scrollRef, virtualizer, sticky } = useBrowseTree({
    rows,
    rowHeight,
    offsetTop: CONTENT_TOP,
    keyOf: rowKey,
    isOpenBranch,
    scrollKey,
  });

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

  const isNodeExpanded = useCallback(
    (node: SourceTreeNode) => node.type === "dir" && isExpanded(node),
    [isExpanded],
  );
  const toggleNode = useCallback(
    (node: SourceTreeNode) => {
      if (node.type === "dir") onToggle(node);
    },
    [onToggle],
  );
  const openNode = useCallback(
    (node: SourceTreeNode) => {
      if (node.type === "file") onOpen?.(node);
    },
    [onOpen],
  );

  const selectionKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, node: SourceTreeNode) =>
      handleSelectionKey(event, {
        selection,
        focusedId: selectionId(node),
        onRun: (how) => runNode(node, how),
      }),
    [selection, runNode],
  );

  /* A `Shift` arrow runs the selection along with the focus, over the rows on screen whatever
     their depth. */
  const extendSelection = useCallback(
    (node: SourceTreeNode, event: KeyboardEvent<HTMLDivElement>) => {
      if (!selection || !event.shiftKey) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const id = selectionId(node);
      if (id !== null) selection.select(id, { toggle: false, extend: true });
    },
    [selection],
  );

  const { focusedIndex, setFocusedIndex, moveFocus, handleKeyDown } = useReadOnlyTreeNav({
    rows,
    isExpanded: isNodeExpanded,
    onToggle: toggleNode,
    onOpen: openNode,
    expandable: isDir,
    activation: activationOf,
    onKey: selectionKey,
    onKeyMove: extendSelection,
    onCollapseAll,
    virtualizer,
    scrollElementRef: scrollRef,
  });

  const landReveal = useCallback(
    (index: number) => {
      moveFocus(index);

      /* A tree drawing a selection marks the selected rows and never the focused
         one, so a reveal that only moved the focus would land on nothing a
         reader can see. */
      const id = idOf(rows[index]!.node);
      if (selection && id !== null) selection.select(id, { toggle: false, extend: false });
    },
    [moveFocus, rows, selection],
  );
  useTreeReveal(rows, reveal, landReveal, onRevealed);

  /* Outside React state, so a pointer crossing the rows redraws the guides and nothing else. */
  const [guides] = useState(createGuideStore);
  const guidesOf = useMemo(() => sourceGuides(rows), [rows]);
  const blockOf = useCallback((index: number) => guidesOf(index).at(-1) ?? null, [guidesOf]);

  useEffect(() => {
    guides.set({ active: blockOf(focusedIndex) });
  }, [guides, blockOf, focusedIndex]);

  function handleMouseOver(event: ReactMouseEvent<HTMLElement>) {
    const index = treeItemIndexOf(event.target);
    guides.set({ hover: index === null ? null : blockOf(index) });
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
    const index = treeItemIndexOf(event.target);
    if (index === null) {
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
      <VirtualTree
        data-ui="SourceTree"
        aria-label={ariaLabel}
        aria-multiselectable={selection !== undefined}
        scrollRef={scrollRef}
        rows={rows}
        items={virtualizer.getVirtualItems()}
        totalSize={virtualizer.getTotalSize()}
        sticky={sticky}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onMouseOver={handleMouseOver}
        onMouseLeave={() => guides.set({ hover: null })}
        onScroll={stirImages}
        menu={<SourceTreeContextMenu node={menuNode} onOpen={onOpen} onRun={runNode} />}
        renderRow={(row, index, pinned) => {
          const node = row.node;
          const isSelected = drawsSelected(node, index, focusedIndex, selection);
          if (pinned) {
            return (
              <SourceTreeRow
                node={node}
                depth={row.depth}
                isExpanded
                isSelected={isSelected}
                guides={guidesOf(index)}
                onToggle={() => revealRow(index)}
                onSelect={handleRowSelect}
                onFocusRow={handleFocusRow}
                onOpen={onOpen}
                onPreview={onPreview}
                height={rowHeight}
                rowIndex={index}
                tabIndex={-1}
                art={art.row}
              />
            );
          }

          return (
            <SourceTreeRow
              node={node}
              depth={row.depth}
              isExpanded={node.type === "dir" && isExpanded(node)}
              isSelected={isSelected}
              guides={guidesOf(index)}
              onToggle={onToggle}
              onToggleSubtree={onToggleSubtree}
              onSelect={handleRowSelect}
              onFocusRow={handleFocusRow}
              onOpen={onOpen}
              onPreview={onPreview}
              height={rowHeight}
              rowIndex={index}
              tabIndex={index === focusedIndex ? 0 : -1}
              art={art.row}
            />
          );
        }}
      />
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

function rowKey(row: SourceRow): string {
  return row.node.id;
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

function isDir(node: SourceTreeNode): boolean {
  return node.type === "dir";
}

/** `Enter` opens a file, the way a double click does, and folds a directory. */
function activationOf(node: SourceTreeNode): NodeActivation {
  if (node.type === "file") return "open";
  if (node.type === "dir") return "toggle";
  return "none";
}

/** What the selection holds a row by: a directory's path, a file's hash. */
function selectionId(node: SourceTreeNode): string | null {
  if (node.type === "dir") return node.path;
  if (node.type === "file") return node.entry.pathHash;
  return null;
}
