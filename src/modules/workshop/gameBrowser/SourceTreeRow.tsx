import { CaretRightIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { twMerge } from "tailwind-merge";

import { MarkedText, Tooltip } from "@/components";
import { formatBytes } from "@/utils";

import {
  CaretSlot,
  FolderGlyph,
  IndentRails,
  TREE_ROW_BASE_CLASSES as ROW_BASE_CLASSES,
  TREE_ROW_STATE_CLASSES as ROW_STATE_CLASSES,
  TreeLoadingRow,
} from "../components/TreeRowParts";
import { describeFileKind } from "../utils/fileKindIcon";
import { fileKindFromPath } from "./fileKind";
import type { SourceDirNode, SourceFileNode, SourceTreeNode } from "./sourceIndex";

interface SourceTreeRowProps {
  node: SourceTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (node: SourceDirNode) => void;
  onSelect: (index: number) => void;
  /** A double click on a file row, or its Open menu item. */
  onOpen?: (node: SourceFileNode) => void;
  height: number;
  rowIndex: number;
  tabIndex: number;
}

function SourceTreeRowInner(props: SourceTreeRowProps) {
  const node = props.node;
  if (node.type === "dir") return <DirRow {...props} node={node} />;
  if (node.type === "file") return <FileRow {...props} node={node} />;
  return <LoadingRow {...props} />;
}

export const SourceTreeRow = memo(SourceTreeRowInner);

interface DirRowProps extends SourceTreeRowProps {
  node: SourceDirNode;
}

function DirRow({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  height,
  rowIndex,
  tabIndex,
}: DirRowProps) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={isExpanded}
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="SourceTreeRow:dir"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={() => {
        onSelect(rowIndex);
        onToggle(node);
      }}
      onFocus={() => onSelect(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge("w-full cursor-pointer text-left", ROW_BASE_CLASSES, ROW_STATE_CLASSES)}
    >
      <IndentRails depth={depth} />
      <CaretRightIcon
        className={twMerge(
          "h-3 w-3 shrink-0 text-surface-400 transition-transform",
          isExpanded && "rotate-90",
        )}
      />
      <FolderGlyph unknown={node.unknown} isExpanded={isExpanded} />
      <span className="truncate">{node.name}</span>
      <span className="ml-auto shrink-0 text-[0.625rem] text-surface-500 tabular-nums">
        {node.fileCount}
      </span>
    </button>
  );
}

interface FileRowProps extends SourceTreeRowProps {
  node: SourceFileNode;
}

function FileRow({
  node,
  depth,
  isSelected,
  onSelect,
  onOpen,
  height,
  rowIndex,
  tabIndex,
}: FileRowProps) {
  const path = node.entry.path;
  const descriptor = describeFileKind(path === null ? "unknown" : fileKindFromPath(path));
  const Icon = descriptor.icon;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="SourceTreeRow:file"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={() => onSelect(rowIndex)}
      onDoubleClick={() => onOpen?.(node)}
      onContextMenu={() => onSelect(rowIndex)}
      onFocus={() => onSelect(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge("cursor-pointer", ROW_BASE_CLASSES, ROW_STATE_CLASSES)}
    >
      <IndentRails depth={depth} />
      <CaretSlot />
      <Tooltip content={descriptor.label}>
        <span
          className="shrink-0"
          style={{ color: `var(${descriptor.tintToken})` }}
          aria-label={descriptor.label}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      </Tooltip>
      <span className="truncate">
        <MarkedText text={node.name} ranges={node.entry.nameRanges} />
      </span>
      <span className="ml-auto shrink-0 font-mono text-[0.625rem] text-surface-400 tabular-nums">
        {formatBytes(node.entry.sizeBytes)}
      </span>
    </div>
  );
}

function LoadingRow({ depth, height, rowIndex, tabIndex }: SourceTreeRowProps) {
  return (
    <TreeLoadingRow
      depth={depth}
      height={height}
      rowIndex={rowIndex}
      tabIndex={tabIndex}
      label="Loading…"
      dataUi="SourceTreeRow:loading"
    />
  );
}
