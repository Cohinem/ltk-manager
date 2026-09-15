import {
  type ColumnDef,
  type Header,
  createSortedRowModel,
  flexRender,
  type ReactTable,
  type Row,
  type RowData,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  type TableOptions,
  useTable,
} from "@tanstack/react-table";
import { Fragment, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { Table } from "./Table";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

export type DataTableColumn<T extends RowData> = ColumnDef<typeof features, T>;
export type DataTableOptions<T extends RowData> = Omit<
  TableOptions<typeof features, T>,
  "features"
>;
export type DataTableInstance<T extends RowData> = ReactTable<typeof features, T>;

export interface DataTableProps<T extends RowData> {
  options: DataTableOptions<T>;
  ariaLabel: string;
  empty?: ReactNode;
  className?: string;
  headerClassName?: string;
  rowProps?: (row: Row<typeof features, T>) => ComponentPropsWithoutRef<"tr">;
  customCells?: boolean;
  customHeaders?: boolean;
  /** A custom surface retains the table's row and column models. */
  children?: (table: DataTableInstance<T>) => ReactNode;
}

/** A sortable table with shared markup and an optional custom surface. */
export function DataTable<T extends RowData>({
  options,
  ariaLabel,
  empty,
  children,
  className,
  headerClassName,
  rowProps,
  customCells,
  customHeaders,
}: DataTableProps<T>) {
  const table = useTable({ features, ...options });
  if (children) return children(table);

  const rows = table.getRowModel().rows;
  return (
    <Table.Root data-ui="DataTable" aria-label={ariaLabel} className={className}>
      <Table.Header className={headerClassName}>
        {table.getHeaderGroups().map((group) => (
          <Table.Row key={group.id}>
            <DataTableHeaders headers={group.headers} customCells={customHeaders} />
          </Table.Row>
        ))}
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.id} {...rowProps?.(row)}>
            <DataTableCells row={row} customCells={customCells} />
          </Table.Row>
        ))}
        {rows.length === 0 && empty && (
          <Table.Row>
            <Table.Cell colSpan={table.getAllLeafColumns().length}>{empty}</Table.Cell>
          </Table.Row>
        )}
      </Table.Body>
    </Table.Root>
  );
}

/** The column renderers for one row, optionally supplying their own cell elements. */
export function DataTableCells<T extends RowData>({
  row,
  customCells = false,
}: {
  row: Row<typeof features, T>;
  customCells?: boolean;
}) {
  return row.getAllCells().map((cell) => {
    const content = flexRender(cell.column.columnDef.cell, cell.getContext());
    if (customCells) return <Fragment key={cell.id}>{content}</Fragment>;
    return <Table.Cell key={cell.id}>{content}</Table.Cell>;
  });
}

/** Column headings for a native table or a surface supplying its own header cells. */
export function DataTableHeaders<T extends RowData>({
  headers,
  customCells = false,
}: {
  headers: readonly Header<typeof features, T>[];
  customCells?: boolean;
}) {
  return headers.map((header) => {
    const direction = header.column.getIsSorted();
    const content = flexRender(header.column.columnDef.header, header.getContext());
    if (customCells) return <Fragment key={header.id}>{content}</Fragment>;
    let heading = content;
    if (!header.isPlaceholder && header.column.getCanSort()) {
      heading = (
        <Table.SortButton direction={direction} onClick={header.column.getToggleSortingHandler()}>
          {content}
        </Table.SortButton>
      );
    }
    if (header.isPlaceholder) heading = null;
    let ariaSort: "ascending" | "descending" | undefined;
    if (direction === "asc") ariaSort = "ascending";
    if (direction === "desc") ariaSort = "descending";
    return (
      <Table.Head key={header.id} colSpan={header.colSpan} aria-sort={ariaSort}>
        {heading}
      </Table.Head>
    );
  });
}
