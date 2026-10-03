import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";

import { useZoomedPx } from "@/hooks";

import { useBrowseTree, useReadOnlyTreeNav } from "../../hooks";
import type { OpenIntent } from "../../palette/utils/types";
import { VirtualTree } from "../../shared/components/VirtualTree";
import { treeItemIndexOf } from "../../shared/utils/tree";
import type {
  ReferenceFileNode,
  ReferenceNode,
  ReferenceObjectNode,
  ReferenceRow,
} from "../utils/referenceTree";
import { flattenReferences } from "../utils/referenceTree";
import { ReferencesContextMenu } from "./ReferencesContextMenu";
import { ReferencesTreeRow } from "./ReferencesTreeRow";

/* The objects tree's fixed row height. Every read-only tree of the editor scans alike. */
const ROW_HEIGHT = 24;

/* The `py-1` above the first row, which the pinned band reads the scroll past. */
const CONTENT_TOP = 4;

function rowKey(row: ReferenceRow): string {
  return row.node.id;
}

interface ReferencesTreeProps {
  files: readonly ReferenceFileNode[];
  ariaLabel: string;
  isShut: (node: ReferenceFileNode) => boolean;
  onToggle: (node: ReferenceFileNode) => void;
  /** Collapse every file, for `Ctrl+Left`. */
  onCollapseAll?: () => void;
  /** A click on an object row, or its Open menu item. */
  onOpen: (node: ReferenceObjectNode, intent: OpenIntent) => void;
}

/**
 * A read-only virtualized tree over one query's answer: a file, then its objects.
 *
 * The objects browser's tree at two fixed levels, with the declaring file pinned above
 * the objects it holds.
 */
export function ReferencesTree({
  files,
  ariaLabel,
  isShut,
  onToggle,
  onCollapseAll,
  onOpen,
}: ReferencesTreeProps) {
  const rows = useMemo(() => flattenReferences(files, isShut), [files, isShut]);

  const zoomed = useZoomedPx();
  const rowHeight = zoomed(ROW_HEIGHT);

  const isOpenBranch = useCallback(
    (row: ReferenceRow) => row.node.type === "file" && !isShut(row.node),
    [isShut],
  );

  const { scrollRef, virtualizer, items, totalSize, sticky } = useBrowseTree({
    rows,
    rowHeight,
    offsetTop: CONTENT_TOP,
    keyOf: rowKey,
    isOpenBranch,
  });

  const { focusedIndex, setFocusedIndex, moveFocus, handleKeyDown } = useReadOnlyTreeNav({
    rows,
    isExpanded: (node: ReferenceNode) => node.type === "file" && !isShut(node),
    onToggle: (node: ReferenceNode) => {
      if (node.type === "file") onToggle(node);
    },
    onOpen: (node: ReferenceNode, intent) => {
      if (node.type === "object") onOpen(node, intent);
    },
    expandable: (node: ReferenceNode) => node.type === "file",
    activation: (node: ReferenceNode) => (node.type === "file" ? "toggle" : "open"),
    virtualizer,
    scrollElementRef: scrollRef,
    onCollapseAll,
  });

  /* One menu for the whole tree, pointed at the row the event came from. */
  const [menuNode, setMenuNode] = useState<ReferenceNode | null>(null);

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const index = treeItemIndexOf(event.target);
    setMenuNode(index === null ? null : (rows[index]?.node ?? null));
  }

  return (
    <VirtualTree
      data-ui="ReferencesTree"
      aria-label={ariaLabel}
      scrollRef={scrollRef}
      rows={rows}
      items={items}
      totalSize={totalSize}
      sticky={sticky}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      menu={<ReferencesContextMenu node={menuNode} onOpen={onOpen} />}
      renderRow={(row, index, pinned) => {
        const isSelected = index === focusedIndex;
        if (pinned) {
          /* A pinned row answers a click by going to the row it stands for. Shutting from up
             there would hide a group whose extent the user cannot see. */
          return (
            <ReferencesTreeRow
              node={row.node}
              depth={row.depth}
              isExpanded
              isSelected={isSelected}
              onToggle={() => moveFocus(index)}
              onSelect={setFocusedIndex}
              onOpen={() => moveFocus(index)}
              height={rowHeight}
              rowIndex={index}
              tabIndex={-1}
            />
          );
        }

        return (
          <ReferencesTreeRow
            node={row.node}
            depth={row.depth}
            isExpanded={row.node.type === "file" && !isShut(row.node)}
            isSelected={isSelected}
            onToggle={onToggle}
            onSelect={setFocusedIndex}
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
