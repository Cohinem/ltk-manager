import { EyeSlashIcon } from "@phosphor-icons/react";
import { memo } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import type { IgnoreMatch } from "@/lib/tauri";
import { twMerge } from "@/utils";
import { formatBytes } from "@/utils";

import { entryChunkPath } from "../../bin/links/hooks/useLinkTargets";
import {
  FolderGlyph,
  IndentRails,
  TreeCaret,
  TREE_ROW_BASE_CLASSES as ROW_BASE_CLASSES,
  TREE_ROW_STATE_CLASSES as ROW_STATE_CLASSES,
} from "../../shared/components/TreeRowParts";
import { describeFileKind } from "../../shared/utils/fileKindIcon";
import { isSubtreeClick } from "../../shared/utils/treeGestures";
import { beginAssetDrag } from "../state/assetDrag";
import type { ContentTreeNode, DirNode, FileNode } from "../utils/contentTree";

const EXCLUDED_ROW_CLASSES = "text-surface-400 hover:text-surface-300";

/**
 * The mark on a row a rule leaves out, naming the rule it came from.
 *
 * The tooltip hangs off the mark rather than off the row, because a file row's
 * kind glyph already owns one and a row-level hover would nest them.
 */
function ExcludedMark({ rule }: { rule: IgnoreMatch }) {
  const subject = m.workshop_ignore_excluded_hint({ pattern: rule.pattern });
  const where =
    rule.line === null
      ? m.workshop_ignore_excluded_source_hint({ source: rule.source })
      : m.workshop_ignore_excluded_rule_hint({ source: rule.source, line: rule.line });

  return (
    <Tooltip
      content={
        <span className="flex flex-col">
          <span>{subject}</span>
          <span>{where}</span>
        </span>
      }
    >
      <span className="shrink-0 text-surface-500" aria-label={`${subject} ${where}`}>
        <EyeSlashIcon className="size-3.5" />
      </span>
    </Tooltip>
  );
}

interface TreeRowProps {
  node: ContentTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  dirFileCount: number;
  onToggle: (path: string) => void;
  /** An Alt+click on a directory row, which collapses or expands its whole subtree. */
  onToggleSubtree?: (node: DirNode) => void;
  onSelect: (index: number) => void;
  /** A double click on a file row, or its Open menu item. */
  onOpen?: (node: FileNode) => void;
  /** A single click on a file row, which previews it while the setting is on. */
  onPreview?: (node: FileNode) => void;
  height: number;
  rowIndex: number;
  tabIndex: number;
}

function TreeRowInner({
  node,
  depth,
  isExpanded,
  isSelected,
  dirFileCount,
  onToggle,
  onToggleSubtree,
  onSelect,
  onOpen,
  onPreview,
  height,
  rowIndex,
  tabIndex,
}: TreeRowProps) {
  if (node.type === "dir") {
    return (
      <DirRow
        node={node}
        depth={depth}
        isExpanded={isExpanded}
        isSelected={isSelected}
        fileCount={dirFileCount}
        onToggle={onToggle}
        onToggleSubtree={onToggleSubtree}
        onSelect={onSelect}
        height={height}
        rowIndex={rowIndex}
        tabIndex={tabIndex}
      />
    );
  }
  return (
    <FileRow
      node={node}
      depth={depth}
      isSelected={isSelected}
      onSelect={onSelect}
      onOpen={onOpen}
      onPreview={onPreview}
      height={height}
      rowIndex={rowIndex}
      tabIndex={tabIndex}
    />
  );
}

export const TreeRow = memo(TreeRowInner);

interface DirRowProps {
  node: DirNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  fileCount: number;
  onToggle: (path: string) => void;
  onToggleSubtree?: (node: DirNode) => void;
  onSelect: (index: number) => void;
  height: number;
  rowIndex: number;
  tabIndex: number;
}

function DirRow({
  node,
  depth,
  isExpanded,
  isSelected,
  fileCount,
  onToggle,
  onToggleSubtree,
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
      data-ui="ContentTreeRow:dir"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={(event) => {
        onSelect(rowIndex);

        if (onToggleSubtree && isSubtreeClick(event)) {
          onToggleSubtree(node);
        } else {
          onToggle(node.path);
        }
      }}
      onContextMenu={() => onSelect(rowIndex)}
      onFocus={() => onSelect(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge(
        "w-full cursor-pointer text-left",
        ROW_BASE_CLASSES,
        ROW_STATE_CLASSES,
        node.ignoredBy && EXCLUDED_ROW_CLASSES,
      )}
    >
      <IndentRails depth={depth} />
      <TreeCaret isExpanded={isExpanded} />
      <FolderGlyph unknown={false} isExpanded={isExpanded} />
      <span className="truncate">{node.name}</span>
      {/* A folder keeps its count: what it holds is true whether or not it ships. */}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="text-fine text-surface-500 tabular-nums">{fileCount}</span>
        {node.ignoredBy && <ExcludedMark rule={node.ignoredBy} />}
      </span>
    </button>
  );
}

interface FileRowProps {
  node: FileNode;
  depth: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onOpen?: (node: FileNode) => void;
  onPreview?: (node: FileNode) => void;
  height: number;
  rowIndex: number;
  tabIndex: number;
}

function FileRow({
  node,
  depth,
  isSelected,
  onSelect,
  onOpen,
  onPreview,
  height,
  rowIndex,
  tabIndex,
}: FileRowProps) {
  const descriptor = describeFileKind(node.entry.kind);
  const Icon = descriptor.icon;
  const excluded = node.entry.ignoredBy;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="ContentTreeRow:file"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={() => {
        onSelect(rowIndex);
        onPreview?.(node);
      }}
      onDoubleClick={() => onOpen?.(node)}
      onPointerDown={(event) => {
        const path = entryChunkPath(node.entry.relativePath);
        if (path !== null) beginAssetDrag(event, path);
      }}
      onContextMenu={() => onSelect(rowIndex)}
      onFocus={() => onSelect(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge(
        "cursor-pointer",
        ROW_BASE_CLASSES,
        ROW_STATE_CLASSES,
        excluded && EXCLUDED_ROW_CLASSES,
      )}
    >
      <IndentRails depth={depth} />
      {/* Reserve chevron slot on files so file and dir names stay column-aligned. */}
      <span aria-hidden="true" className="size-3 shrink-0" />
      <Tooltip content={descriptor.label}>
        <span
          className="shrink-0"
          /* DS-KIND-HUE: the hue names the kind, and an excluded row has none to name. */
          style={excluded ? undefined : { color: `var(${descriptor.tintToken})` }}
          aria-label={descriptor.label}
        >
          <Icon
            className={twMerge("size-3.5", excluded && "text-surface-500")}
            strokeWidth={1.75}
          />
        </span>
      </Tooltip>
      <span className="truncate">{node.name}</span>
      {/* A size is a fact about what ships, so a row that ships nothing gives the seat up. */}
      <span className="ml-auto shrink-0">
        {excluded && <ExcludedMark rule={excluded} />}
        {!excluded && (
          <span className="text-fine text-surface-400 tabular-nums">
            {formatBytes(Number(node.entry.sizeBytes))}
          </span>
        )}
      </span>
    </div>
  );
}
