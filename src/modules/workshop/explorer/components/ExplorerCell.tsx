import { memo } from "react";

import { m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";
import { formatBytes, twMerge } from "@/utils";

import { fileKindFromPath } from "../../gameBrowser/utils/fileKind";
import { describeFileKind } from "../../shared/utils/fileKindIcon";
import type { ExplorerColumn } from "../utils/columns";
import type { ExplorerItem } from "../utils/items";
import { itemNameClass } from "../utils/itemState";
import { ExplorerArt } from "./ExplorerArt";

export interface ExplorerCellProps {
  item: ExplorerItem;
  column: ExplorerColumn;
  /** The art's box in px, which the zoom has already been applied to. */
  artBox: number;
  /** The width a thumbnail is asked for, which is the smallest tile size. */
  requestWidth: number;
  thumbnails: boolean;
  selected: boolean;
  assetOf: (item: ExplorerItem) => AssetRef | null;
}

/** One explorer column's content and cell element. */
function ExplorerCellInner({
  item,
  column,
  artBox,
  requestWidth,
  thumbnails,
  selected,
  assetOf,
}: ExplorerCellProps) {
  return (
    <>
      {column === "name" && (
        <span role="gridcell" className="flex min-w-0 items-center gap-2 pl-1.5">
          <ExplorerArt
            item={item}
            box={artBox}
            requestWidth={requestWidth}
            thumbnails={thumbnails}
            assetOf={assetOf}
            variant="row"
          />
          <span
            title={item.name}
            className={twMerge("truncate font-medium", itemNameClass(selected))}
          >
            {item.name}
          </span>
        </span>
      )}
      {column === "size" && (
        <span
          role="gridcell"
          className="truncate pr-3 text-right font-mono text-meta text-surface-400 tabular-nums"
        >
          {sizeCell(item)}
        </span>
      )}
      {column === "kind" && (
        <span role="gridcell" className="truncate pr-2 text-meta text-surface-500">
          {kindCell(item)}
        </span>
      )}
    </>
  );
}

export const ExplorerCell = memo(ExplorerCellInner);

/* A directory reads what it holds, because no source totals the bytes below
   one, and a blank cell in a size column reads as a size of zero. */
function sizeCell(item: ExplorerItem): string {
  if (item.kind === "dir") return m.workshop_explorer_tile_files_label({ count: item.fileCount });
  return formatBytes(item.entry.sizeBytes);
}

function kindCell(item: ExplorerItem): string {
  if (item.kind === "dir") return m.workshop_explorer_kind_folder_label();
  const path = item.entry.path;
  return describeFileKind(path === null ? "unknown" : fileKindFromPath(path)).label;
}
