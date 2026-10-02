import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";

import { useZoomedPx } from "@/hooks";

import { useBrowseTree, useReadOnlyTreeNav, useTreeReveal } from "../../hooks";
import type { OpenIntent } from "../../palette/utils/types";
import { VirtualTree } from "../../shared/components/VirtualTree";
import { treeItemIndexOf } from "../../shared/utils/tree";
import { type RowReveal, useSelectObjectNode } from "../../state";
import { useRestPreview } from "../hooks/useRestPreview";
import {
  activation,
  expandable,
  flattenObjectTree,
  type ObjectTreeNode,
  type ObjectTreeRow,
} from "../utils/objectTree";
import { ObjectsContextMenu } from "./ObjectsContextMenu";
import { ObjectsTreeRow } from "./ObjectsTreeRow";

/* The source tree's fixed row height. The two browsers scan alike. */
const ROW_HEIGHT = 24;

/* The `py-1` above the first row, which the pinned band reads the scroll past. */
const CONTENT_TOP = 4;

function rowKey(row: ObjectTreeRow): string {
  return row.node.id;
}

interface ObjectsTreeProps {
  nodes: readonly ObjectTreeNode[];
  ariaLabel: string;
  isExpanded: (node: ObjectTreeNode) => boolean;
  /** A folder toggle. `subtree` asks for every level below as well. */
  onToggle: (node: ObjectTreeNode, subtree?: boolean) => void;
  /** Collapse every folder, for `Ctrl+Left`. */
  onCollapseAll?: () => void;
  /** A click on an object row, or its Open menu item. */
  onOpen: (node: ObjectTreeNode, intent: OpenIntent) => void;
  /** Names this tree's scroll to the browser store. Absent starts at the top. */
  scrollKey?: string;
  /** The row to expand to, focus and scroll to. A listing in flight defers it. */
  reveal?: RowReveal | null;
  /** The reveal with `token` landed, or has no row to land on. */
  onRevealed?: (token: number) => void;
}

/**
 * A read-only virtualized tree over the object nodes, browse and find alike.
 *
 * A keyboard move that rests on a particle system opens its preview tab.
 */
export function ObjectsTree({
  nodes,
  ariaLabel,
  isExpanded,
  onToggle,
  onCollapseAll,
  onOpen,
  scrollKey,
  reveal = null,
  onRevealed,
}: ObjectsTreeProps) {
  const rows = useMemo(() => flattenObjectTree(nodes, isExpanded), [nodes, isExpanded]);
  const selectNode = useSelectObjectNode();

  const isOpenBranch = useCallback(
    (row: ObjectTreeRow) =>
      (row.node.type === "prefix" || row.node.type === "object") && isExpanded(row.node),
    [isExpanded],
  );

  const zoomed = useZoomedPx();
  const rowHeight = zoomed(ROW_HEIGHT);

  const { scrollRef, virtualizer, sticky } = useBrowseTree({
    rows,
    rowHeight,
    offsetTop: CONTENT_TOP,
    keyOf: rowKey,
    isOpenBranch,
    scrollKey,
  });

  const restPreview = useRestPreview(scrollRef);
  const { focusedIndex, setFocusedIndex, moveFocus, handleKeyDown } = useReadOnlyTreeNav({
    rows,
    isExpanded,
    onToggle,
    onOpen,
    expandable,
    activation: (node) => activation(node, "row"),
    virtualizer,
    scrollElementRef: scrollRef,
    onKeyMove: restPreview,
    onCollapseAll,
  });
  const select = (index: number) => {
    setFocusedIndex(index);
    const row = rows[index];
    if (row) selectNode(row.node);
  };

  useTreeReveal(rows, reveal, moveFocus, onRevealed);

  /* A pinned row answers a click by going to the row it stands for. Collapsing
     from up there would shut a prefix the user cannot see the extent of. */
  const revealRow = useCallback(
    (index: number) => {
      setFocusedIndex(index);
      virtualizer.scrollToIndex(index, { align: "start" });
    },
    [setFocusedIndex, virtualizer],
  );

  /* One menu for the whole tree, pointed at the row the event came from. */
  const [menuNode, setMenuNode] = useState<ObjectTreeNode | null>(null);

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const index = treeItemIndexOf(event.target);
    setMenuNode(index === null ? null : (rows[index]?.node ?? null));
  }

  return (
    <VirtualTree
      data-ui="ObjectsTree"
      aria-label={ariaLabel}
      scrollRef={scrollRef}
      rows={rows}
      items={virtualizer.getVirtualItems()}
      totalSize={virtualizer.getTotalSize()}
      sticky={sticky}
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) => {
        const index = treeItemIndexOf(event.target);
        const row = index === null ? undefined : rows[index];
        if (row) selectNode(row.node);
      }}
      onContextMenu={handleContextMenu}
      menu={<ObjectsContextMenu node={menuNode} onOpen={onOpen} />}
      renderRow={(row, index, pinned) => {
        const isSelected = index === focusedIndex;
        if (pinned) {
          return (
            <ObjectsTreeRow
              node={row.node}
              depth={row.depth}
              isExpanded
              isSelected={isSelected}
              onToggle={() => revealRow(index)}
              onSelect={select}
              onOpen={() => revealRow(index)}
              height={rowHeight}
              rowIndex={index}
              tabIndex={-1}
            />
          );
        }

        const node = row.node;
        return (
          <ObjectsTreeRow
            node={node}
            depth={row.depth}
            isExpanded={(node.type === "prefix" || node.type === "object") && isExpanded(node)}
            isSelected={isSelected}
            onToggle={onToggle}
            onSelect={select}
            onOpen={onOpen}
            height={rowHeight}
            rowIndex={index}
            tabIndex={isSelected ? 0 : -1}
          />
        );
      }}
    />
  );
}
