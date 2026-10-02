import { memo, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { MarkedText, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";
import type { ExplorerArtShape } from "@/stores";
import { twMerge } from "@/utils";
import { formatBytes } from "@/utils";

import type { ExplorerItem } from "../../explorer";
import { ExplorerArt } from "../../explorer/components/ExplorerArt";
import {
  CaretSlot,
  FolderGlyph,
  GuideRails,
  TREE_ROW_BASE_CLASSES as ROW_BASE_CLASSES,
  TREE_ROW_STATE_CLASSES as ROW_STATE_CLASSES,
  TreeCaret,
  TreeLoadingRow,
  TreeRowCount,
} from "../../shared/components/TreeRowParts";
import { describeFileKind } from "../../shared/utils/fileKindIcon";
import { isSubtreeClick } from "../../shared/utils/treeGestures";
import { fileKindFromPath } from "../utils/fileKind";
import type { SourceDirNode, SourceFileNode, SourceTreeNode } from "../utils/sourceIndex";

/** How a tree drawing thumbnails sizes and sources each row's art, in zoomed px. */
export interface SourceTreeArt {
  box: number;
  /** The column the art reserves, so every name starts on one edge whatever its plate's width. */
  slotWidth: number;
  /** The width a thumbnail is asked for, which is one of the six tile sizes. */
  requestWidth: number;
  shape: ExplorerArtShape;
  assetOf: (item: ExplorerItem) => AssetRef | null;
}

interface SourceTreeRowProps {
  node: SourceTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  /** The row's ancestors, outermost first, which name the blocks its guides draw. */
  guides: readonly string[];
  onToggle: (node: SourceDirNode) => void;
  /** An Alt+click on a directory's caret, which toggles its whole subtree. */
  onToggleSubtree?: (node: SourceDirNode) => void;
  /** A click, which writes the selection under whichever modifiers it carried. */
  onSelect: (index: number, event?: ReactMouseEvent<HTMLElement>) => void;
  /** The focus landing here, which moves the ring and nothing else. */
  onFocusRow: (index: number) => void;
  /** A double click on a file row, or its Open menu item. */
  onOpen?: (node: SourceFileNode) => void;
  /** A single click on a file row, which previews it while the setting is on. */
  onPreview?: (node: SourceFileNode) => void;
  height: number;
  rowIndex: number;
  tabIndex: number;
  /** The row's art while the tree draws thumbnails, and null for the kind glyph. */
  art?: SourceTreeArt | null;
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
  guides,
  onToggle,
  onToggleSubtree,
  onSelect,
  onFocusRow,
  height,
  rowIndex,
  tabIndex,
  art,
}: DirRowProps) {
  return (
    <div
      role="treeitem"
      aria-expanded={isExpanded}
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="SourceTreeRow:dir"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={(event) => onSelect(rowIndex, event)}
      onDoubleClick={() => onToggle(node)}
      onFocus={() => onFocusRow(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge("w-full cursor-pointer text-left", ROW_BASE_CLASSES, ROW_STATE_CLASSES)}
    >
      <GuideRails blocks={guides} />
      {/* Its own target, so opening a directory is not also selecting every
          file below it, which is what selecting a directory means. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={
          isExpanded ? m.workshop_explorer_collapse_action() : m.workshop_explorer_expand_action()
        }
        onClick={(event) => {
          event.stopPropagation();

          if (onToggleSubtree && isSubtreeClick(event)) {
            onToggleSubtree(node);
          } else {
            onToggle(node);
          }
        }}
        className="-m-0.5 shrink-0 rounded-sm p-0.5 hover:bg-surface-veil"
      >
        <TreeCaret isExpanded={isExpanded} />
      </button>
      <ArtAndName
        art={art}
        glyph={
          art ? (
            <ArtSlot art={art}>
              <ExplorerArt
                item={{
                  kind: "dir",
                  id: node.path,
                  name: node.name,
                  fileCount: node.fileCount,
                }}
                box={art.box}
                requestWidth={art.requestWidth}
                thumbnails
                assetOf={art.assetOf}
                variant="row"
              />
            </ArtSlot>
          ) : (
            <FolderGlyph unknown={node.unknown} isExpanded={isExpanded} />
          )
        }
      >
        {node.name}
      </ArtAndName>
      <TreeRowCount>{node.fileCount}</TreeRowCount>
    </div>
  );
}

interface FileRowProps extends SourceTreeRowProps {
  node: SourceFileNode;
}

function FileRow({
  node,
  depth,
  isSelected,
  guides,
  onSelect,
  onFocusRow,
  onOpen,
  onPreview,
  height,
  rowIndex,
  tabIndex,
  art,
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
      onClick={(event) => {
        onSelect(rowIndex, event);
        onPreview?.(node);
      }}
      onDoubleClick={() => onOpen?.(node)}
      onFocus={() => onFocusRow(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge("cursor-pointer", ROW_BASE_CLASSES, ROW_STATE_CLASSES)}
    >
      <GuideRails blocks={guides} />
      <CaretSlot />
      <ArtAndName
        art={art}
        glyph={
          <Tooltip content={descriptor.label}>
            {art ? (
              <ArtSlot art={art} label={descriptor.label}>
                <ExplorerArt
                  item={{
                    kind: "file",
                    id: node.id,
                    name: node.name,
                    entry: node.entry,
                  }}
                  box={art.box}
                  requestWidth={art.requestWidth}
                  thumbnails
                  assetOf={art.assetOf}
                  variant="row"
                  shape={art.shape}
                />
              </ArtSlot>
            ) : (
              <span
                className="shrink-0"
                style={{ color: `var(${descriptor.tintToken})` }}
                aria-label={descriptor.label}
              >
                <Icon className="size-3.5" strokeWidth={1.75} />
              </span>
            )}
          </Tooltip>
        }
      >
        <MarkedText text={node.name} ranges={node.entry.nameRanges} />
      </ArtAndName>
      <span className="ml-auto shrink-0 text-fine text-surface-400 tabular-nums">
        {formatBytes(node.entry.sizeBytes)}
      </span>
    </div>
  );
}

interface ArtSlotProps {
  art: SourceTreeArt;
  label?: string;
  children: ReactNode;
}

/** The art's reserved column, with a plate narrower than it held to its leading edge. */
function ArtSlot({ art, label, children }: ArtSlotProps) {
  return (
    <span
      aria-label={label}
      className="flex shrink-0 items-center"
      style={{ width: `${art.slotWidth}px` }}
    >
      {children}
    </span>
  );
}

interface ArtAndNameProps {
  art?: SourceTreeArt | null;
  glyph: ReactNode;
  children: ReactNode;
}

/** A row's glyph and name, set further apart once the glyph is a thumbnail. DS-GAP. */
function ArtAndName({ art, glyph, children }: ArtAndNameProps) {
  const name = <span className="truncate">{children}</span>;
  if (!art) {
    return (
      <>
        {glyph}
        {name}
      </>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      {glyph}
      {name}
    </span>
  );
}

function LoadingRow({ depth, guides, height, rowIndex, tabIndex }: SourceTreeRowProps) {
  return (
    <TreeLoadingRow
      depth={depth}
      height={height}
      rowIndex={rowIndex}
      tabIndex={tabIndex}
      label="Loading…"
      dataUi="SourceTreeRow:loading"
      guides={guides}
    />
  );
}
