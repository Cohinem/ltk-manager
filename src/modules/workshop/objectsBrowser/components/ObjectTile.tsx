import {
  CaretRightIcon,
  CubeIcon,
  FolderIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { clickIntent } from "../../state";
import { useOpenObjectNode } from "../hooks/useOpenObjectNode";
import type { ObjectPrefixNode, ObjectRowNode } from "../utils/objectTree";
import { ObjectSource } from "./ObjectsTreeRow";

interface ObjectTileProps {
  node: ObjectPrefixNode | ObjectRowNode;
  index: number;
  focused: boolean;
  artHeight: number;
  captionHeight: number;
  footerHeight: number;
  image?: string | null;
  loading: boolean;
  onFocus: () => void;
  onAim: () => void;
  onLeave: () => void;
  onDescend: (path: string) => void;
}

/** Compact object artwork and identity with a separate child-navigation footer. */
export function ObjectTile({
  node,
  index,
  focused,
  artHeight,
  captionHeight,
  footerHeight,
  image,
  loading,
  onFocus,
  onAim,
  onLeave,
  onDescend,
}: ObjectTileProps) {
  const open = useOpenObjectNode();
  const object = node.type === "object";

  return (
    <div
      data-ui="ObjectTile"
      className={twMerge(
        "group flex min-w-0 flex-col overflow-hidden rounded-lg border border-surface-veil-strong bg-surface-900 focus-within:border-accent-500 hover:border-accent-hover",
        focused && "border-accent-500/40",
      )}
    >
      <Button
        variant="ghost"
        data-object-index={index}
        tabIndex={focused ? 0 : -1}
        aria-label={[node.name, object && node.declarations[0]?.class].filter(Boolean).join(" ")}
        aria-description={image === null ? m.workshop_objects_preview_failed_label() : undefined}
        aria-busy={loading}
        className="h-auto min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-none p-0 text-left"
        onPointerEnter={onAim}
        onPointerLeave={onLeave}
        onFocus={onFocus}
        onClick={(event) => {
          if (object) {
            open(node, clickIntent(event));
          } else {
            onDescend(node.id);
          }
        }}
        onDoubleClick={() => {
          if (object) {
            open(node, "permanent");
          }
        }}
        title={node.id}
      >
        <span
          data-object-art-index={index}
          className="relative flex shrink-0 items-center justify-center overflow-hidden bg-surface-950/40"
          style={{ height: artHeight }}
        >
          {image && <img src={image} alt="" className="size-full object-contain" />}
          {!image && object && (
            <CubeIcon weight="duotone" className="size-7 text-bin-class-text/70" />
          )}
          {!object && <FolderIcon weight="duotone" className="size-8 text-folder-text" />}
          {loading && (
            <SpinnerGapIcon
              aria-hidden
              className="absolute right-2 bottom-2 size-3.5 animate-spin text-surface-300"
            />
          )}
          {image === null && (
            <WarningCircleIcon
              aria-hidden
              className="absolute right-2 bottom-2 size-3.5 text-surface-400"
            />
          )}
        </span>
        <span
          className="flex shrink-0 flex-col justify-center gap-0.5 px-2"
          style={{ height: captionHeight }}
        >
          <span className="truncate text-row font-medium text-surface-100">{node.name}</span>
          {object && (
            <span className="truncate text-fine font-normal text-surface-400">
              {node.declarations[0]?.class}
            </span>
          )}
          {!object && (
            <span className="truncate text-fine font-normal text-surface-400">
              {m.workshop_objects_count_label({ count: node.count })}
            </span>
          )}
        </span>
      </Button>
      <div
        className="flex min-w-0 shrink-0 items-center gap-1 border-t border-surface-veil-strong pl-2 text-fine text-surface-400"
        style={{ height: footerHeight }}
      >
        <span className="min-w-0 flex-1 truncate">{object && <ObjectSource node={node} />}</span>
        {node.count > 0 && (
          <Tooltip content={m.workshop_objects_children_action({ count: node.count })}>
            <Button
              variant="ghost"
              size="xs"
              compact
              onClick={() => onDescend(node.id)}
              aria-label={m.workshop_objects_children_action({ count: node.count })}
              className="h-full shrink-0 gap-0.5 rounded-none border-l border-surface-veil-strong px-1.5 text-fine tabular-nums"
            >
              <FolderIcon weight="duotone" className="size-3 text-folder-text" />
              {node.count}
              <CaretRightIcon weight="bold" className="size-2.5" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
