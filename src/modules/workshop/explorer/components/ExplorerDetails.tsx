import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useRef } from "react";

import { DataTable, DataTableCells, type DataTableColumn } from "@/components";
import { useZoomedPx } from "@/hooks";
import type { AssetRef } from "@/lib/tauri";
import { useExplorerColumns, useExplorerRowHeight, useZoomLevel } from "@/stores";
import { twMerge } from "@/utils";

import { fileKindFromPath } from "../../gameBrowser/utils/fileKind";
import type { ExplorerSelectionApi } from "../hooks/useExplorer";
import { type ExplorerColumn, columnTemplate, visibleColumns } from "../utils/columns";
import { ART_REQUEST_WIDTH, artBoxFor, nameTypeForRow } from "../utils/detailsRow";
import { type ExplorerFileItem, type ExplorerItem, itemPath } from "../utils/items";
import { itemStateClasses } from "../utils/itemState";
import { ExplorerCell } from "./ExplorerCell";
import { ExplorerDetailsHeader } from "./ExplorerDetailsHeader";
import { useExplorerSort, useSetExplorerSort } from "./ExplorerSortScope";
import { type ExplorerRowAttributes, ExplorerSurface, useMeasuredWidth } from "./ExplorerSurface";

/** The header's height in px before the zoom. A row's own height is a setting. */
const HEADER_HEIGHT = 26;

export interface ExplorerDetailsProps {
  items: readonly ExplorerItem[];
  thumbnails: boolean;
  selection: ExplorerSelectionApi;
  ariaLabel: string;
  onDescend: (path: string) => void;
  onOpen: (item: ExplorerFileItem) => void;
  onUp: () => void;
  assetOf: (item: ExplorerItem) => AssetRef | null;
  renderMenu?: (item: ExplorerItem | null) => ReactNode;
  onRun?: (how: "quick" | "dialog" | "copy") => void;
}

/**
 * One directory as rows with columns, virtualized a row at a time.
 *
 * The list is what serves a modder reading a directory by its facts rather than
 * by its art: the size that the grid draws small and the kind that it draws as
 * a glyph both become a column a click sorts on.
 */
export function ExplorerDetails({
  items,
  thumbnails,
  selection,
  ariaLabel,
  onDescend,
  onOpen,
  onUp,
  assetOf,
  renderMenu,
  onRun,
}: ExplorerDetailsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomed = useZoomedPx();
  const zoomLevel = useZoomLevel();
  const widths = useExplorerColumns();
  const height = useExplorerRowHeight();
  const sort = useExplorerSort();
  const setSort = useSetExplorerSort();

  const width = useMeasuredWidth(scrollRef);
  /* The drop is about how much a reader fits, so it reads the pane at the zoom
     the columns were measured for rather than in the pixels it happens to own. */
  const columns = visibleColumns(Math.round((width * 100) / zoomLevel));
  const template = columnTemplate(columns, {
    size: zoomed(widths.size),
    kind: zoomed(widths.kind),
  });

  const rowHeight = zoomed(height);
  const artBox = zoomed(artBoxFor(height));
  const headerHeight = zoomed(HEADER_HEIGHT);
  const nameType = nameTypeForRow(height);
  const rowStyle = useMemo(() => ({ gridTemplateColumns: template }), [template]);

  const definitions = useMemo<DataTableColumn<ExplorerItem>[]>(
    () =>
      columns.map((column) => ({
        id: column,
        accessorFn: (item) => {
          if (column === "name") return item.name;
          if (column === "size") return item.kind === "dir" ? item.fileCount : item.entry.sizeBytes;
          return item.kind === "dir" ? "folder" : fileKindFromPath(item.entry.path ?? item.name);
        },
        cell: ({ row }) => <DetailsCell item={row.original} column={column} />,
      })),
    [columns],
  );

  const rowAttrs = useCallback(
    (row: readonly ExplorerItem[], from: number, focused: number): ExplorerRowAttributes => {
      const item = row[0];
      if (!item) return {};

      const selected = selection.isSelected(item.id);
      return {
        "data-item-index": from,
        "data-item-id": item.id,
        "aria-selected": selected,
        tabIndex: from === focused ? 0 : -1,
        className: twMerge(
          "cursor-pointer outline-none hover:bg-surface-veil",
          nameType.className,
          itemStateClasses({
            selected,
            covered: selection.isCoveredPath(itemPath(item)),
            focused: from === focused,
          }),
        ),
      };
    },
    [selection, nameType],
  );

  return (
    <CellContext value={{ artBox, thumbnails, selection, assetOf }}>
      <DataTable
        ariaLabel={ariaLabel}
        options={{
          data: items,
          columns: definitions,
          getRowId: (item) => item.id,
          // Directory-first ordering is shared by the views within this tab.
          manualSorting: true,
          enableSortingRemoval: false,
          state: { sorting: [{ id: sort.field, desc: sort.direction === "desc" }] },
          onSortingChange: (update) => {
            const current = [{ id: sort.field, desc: sort.direction === "desc" }];
            const next = typeof update === "function" ? update(current) : update;
            const first = next[0];
            if (first && (first.id === "name" || first.id === "size" || first.id === "kind")) {
              setSort({ field: first.id, direction: first.desc ? "desc" : "asc" });
            }
          },
        }}
      >
        {(table) => (
          <ExplorerSurface
            items={items}
            scrollRef={scrollRef}
            columns={1}
            rowHeight={rowHeight}
            selection={selection}
            ariaLabel={ariaLabel}
            dataUi="ExplorerDetails"
            scrollClassName="select-none"
            rowClassName="grid items-center"
            rowStyle={rowStyle}
            rowAttrs={rowAttrs}
            headerHeight={headerHeight}
            header={
              <ExplorerDetailsHeader
                columns={columns}
                template={template}
                height={headerHeight}
                sortField={sort.field}
                sortDescending={sort.direction === "desc"}
                onSort={(field) =>
                  table
                    .getColumn(field)
                    ?.toggleSorting(sort.field === field ? sort.direction !== "desc" : false)
                }
              />
            }
            onDescend={onDescend}
            onOpen={onOpen}
            onUp={onUp}
            renderMenu={renderMenu}
            onRun={onRun}
            renderRow={(_row, from) => {
              const row = table.getRowModel().rows[from];
              return row && <DataTableCells row={row} customCells />;
            }}
          />
        )}
      </DataTable>
    </CellContext>
  );
}

const CellContext = createContext<
  (Pick<ExplorerDetailsProps, "thumbnails" | "selection" | "assetOf"> & { artBox: number }) | null
>(null);

function DetailsCell({ item, column }: { item: ExplorerItem; column: ExplorerColumn }) {
  const context = use(CellContext);
  if (context === null) return null;
  return (
    <ExplorerCell
      item={item}
      column={column}
      artBox={context.artBox}
      requestWidth={ART_REQUEST_WIDTH}
      thumbnails={context.thumbnails}
      selected={context.selection.isSelected(item.id)}
      assetOf={context.assetOf}
    />
  );
}
