import { CaretRightIcon, CubeIcon, FileIcon } from "@phosphor-icons/react";
import { memo, type MouseEvent as ReactMouseEvent } from "react";
import { twMerge } from "tailwind-merge";

import { MarkedText } from "@/components";
import { m } from "@/i18n";

import { ClassCard } from "../bin/ClassCard";
import { LayerGlyph } from "../components/LayerGlyph";
import {
  CaretSlot,
  FolderGlyph,
  IndentRails,
  TREE_ROW_BASE_CLASSES as ROW_BASE_CLASSES,
  TREE_ROW_STATE_CLASSES as ROW_STATE_CLASSES,
  TreeLoadingRow,
} from "../components/TreeRowParts";
import { declaringFileContext } from "../documents/contentDocument";
import type { OpenIntent } from "../palette/types";
import { assetContext } from "../preview/assetRef";
import { clickIntent } from "../state";
import {
  expandable,
  type ObjectDeclarationNode,
  type ObjectMoreNode,
  type ObjectPrefixNode,
  type ObjectRowNode,
  type ObjectTreeNode,
  rangesInName,
} from "./objectTree";

interface ObjectsTreeRowProps {
  node: ObjectTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (node: ObjectTreeNode) => void;
  onSelect: (index: number) => void;
  /** A click on an object or a declaration row, with the intent the click carries. */
  onOpen: (node: ObjectTreeNode, intent: OpenIntent) => void;
  height: number;
  rowIndex: number;
  tabIndex: number;
}

function ObjectsTreeRowInner(props: ObjectsTreeRowProps) {
  const node = props.node;
  switch (node.type) {
    case "prefix":
      return <PrefixRow {...props} node={node} />;
    case "object":
      return <ObjectRow {...props} node={node} />;
    case "declaration":
      return <DeclarationRow {...props} node={node} />;
    case "more":
      return <MoreRow {...props} node={node} />;
    default:
      return (
        <TreeLoadingRow
          depth={props.depth}
          height={props.height}
          rowIndex={props.rowIndex}
          tabIndex={props.tabIndex}
          label={m.workshop_objects_loading_label()}
          dataUi="ObjectsTreeRow:loading"
        />
      );
  }
}

export const ObjectsTreeRow = memo(ObjectsTreeRowInner);

function Caret({ isExpanded }: { isExpanded: boolean }) {
  return (
    <CaretRightIcon
      className={twMerge(
        "h-3 w-3 shrink-0 text-surface-400 transition-transform",
        isExpanded && "rotate-90",
      )}
    />
  );
}

interface PrefixRowProps extends ObjectsTreeRowProps {
  node: ObjectPrefixNode;
}

function PrefixRow({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  height,
  rowIndex,
  tabIndex,
}: PrefixRowProps) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={isExpanded}
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="ObjectsTreeRow:prefix"
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
      <Caret isExpanded={isExpanded} />
      <FolderGlyph unknown={node.unnamed} isExpanded={isExpanded} />
      <span className="truncate">{node.name}</span>
      <span className="ml-auto shrink-0 text-[0.625rem] text-surface-500 tabular-nums">
        {node.count.toLocaleString()}
      </span>
    </button>
  );
}

interface ObjectRowProps extends ObjectsTreeRowProps {
  node: ObjectRowNode;
}

/**
 * An object: its mark, its last segment, its class and its source.
 *
 * A node that is both an object and a prefix opens from its body and toggles from its
 * caret alone, per "What a row opens" in docs/ux/PROJECT_EDITOR.md.
 */
function ObjectRow({
  node,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onOpen,
  height,
  rowIndex,
  tabIndex,
}: ObjectRowProps) {
  const first = node.declarations[0];
  const opens = expandable(node);

  return (
    <div
      role="treeitem"
      aria-expanded={opens ? isExpanded : undefined}
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="ObjectsTreeRow:object"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={(event) => {
        onSelect(rowIndex);
        onOpen(node, clickIntent(event));
      }}
      onDoubleClick={() => onOpen(node, "permanent")}
      onContextMenu={() => onSelect(rowIndex)}
      onFocus={() => onSelect(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge("cursor-pointer", ROW_BASE_CLASSES, ROW_STATE_CLASSES)}
    >
      <IndentRails depth={depth} />
      {opens && (
        <span
          role="presentation"
          className="flex h-4 w-3 shrink-0 cursor-pointer items-center justify-center"
          onClick={(event: ReactMouseEvent<HTMLSpanElement>) => {
            event.stopPropagation();
            onSelect(rowIndex);
            onToggle(node);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Caret isExpanded={isExpanded} />
        </span>
      )}
      {!opens && <CaretSlot />}
      <CubeIcon className="h-3.5 w-3.5 shrink-0 text-surface-400" />
      <span className={twMerge("truncate", node.unnamed && "text-surface-300")}>
        <MarkedText text={node.name} ranges={rangesInName(node.path, node.ranges)} />
      </span>
      {first && (
        <span className="ml-2 max-w-[40%] shrink-0 truncate">
          <ClassCard classHash={first.classHash} name={classLabel(first.class, first.classHash)} />
        </span>
      )}
      <span className="ml-auto max-w-[40%] shrink-0 truncate text-[0.625rem] text-surface-400">
        <Source node={node} />
      </span>
      {node.layers.map((layer) => (
        <span key={layer.name} className="flex shrink-0 items-center gap-1 text-[0.625rem]">
          <LayerGlyph layerName={layer.name} className="h-3 w-3" />
          <span className="text-surface-400">{layer.title}</span>
        </span>
      ))}
    </div>
  );
}

/** The class as the card takes it: the name, or null where the tables gave only the hash. */
function classLabel(cls: string, classHash: string): string | null {
  return cls === classHash ? null : cls;
}

/** The declaring file, or how many files declare the node. */
function Source({ node }: { node: ObjectRowNode }) {
  const first = node.declarations[0];
  if (!first) return null;
  if (node.declarations.length > 1) {
    return <>{m.workshop_objects_files_label({ count: node.declarations.length })}</>;
  }
  return <>{declaringFileContext(first.asset, first.file)}</>;
}

interface DeclarationRowProps extends ObjectsTreeRowProps {
  node: ObjectDeclarationNode;
}

/** One declaring file of the object above, opening its own tab. */
function DeclarationRow({
  node,
  depth,
  isSelected,
  onSelect,
  onOpen,
  height,
  rowIndex,
  tabIndex,
}: DeclarationRowProps) {
  const where = node.layer?.title ?? assetContext(node.declaration.asset);

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      data-ui="ObjectsTreeRow:declaration"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      onClick={(event) => {
        onSelect(rowIndex);
        onOpen(node, clickIntent(event));
      }}
      onDoubleClick={() => onOpen(node, "permanent")}
      onContextMenu={() => onSelect(rowIndex)}
      onFocus={() => onSelect(rowIndex)}
      style={{ height: `${height}px` }}
      className={twMerge("cursor-pointer", ROW_BASE_CLASSES, ROW_STATE_CLASSES)}
    >
      <IndentRails depth={depth} />
      <CaretSlot />
      {node.layer !== null && <LayerGlyph layerName={node.layer.name} />}
      {node.layer === null && <FileIcon className="h-3.5 w-3.5 shrink-0 text-surface-400" />}
      <span className="truncate text-surface-300">{node.declaration.file}</span>
      {where !== undefined && (
        <span className="ml-auto shrink-0 text-[0.625rem] text-surface-400">{where}</span>
      )}
    </div>
  );
}

interface MoreRowProps extends ObjectsTreeRowProps {
  node: ObjectMoreNode;
}

/** The hits the cap left out, closing a find. */
function MoreRow({ node, depth, height, rowIndex, tabIndex }: MoreRowProps) {
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      data-ui="ObjectsTreeRow:more"
      data-treeitem-index={rowIndex}
      tabIndex={tabIndex}
      style={{ height: `${height}px` }}
      className={ROW_BASE_CLASSES}
    >
      <IndentRails depth={depth} />
      <CaretSlot />
      <span className="text-surface-400">
        {m.workshop_objects_more_label({ count: node.count.toLocaleString() })}
      </span>
    </div>
  );
}
