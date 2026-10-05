import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";
import { match } from "ts-pattern";

import { twMerge } from "@/utils";

import { focusRing } from "./focus";

// Root
export const TableRoot = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<"table">>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={twMerge("w-full border-separate border-spacing-0 text-row", className)}
      {...props}
    />
  ),
);
TableRoot.displayName = "Table.Root";

// Header
export const TableHeader = forwardRef<HTMLTableSectionElement, ComponentPropsWithoutRef<"thead">>(
  ({ className, ...props }, ref) => <thead ref={ref} className={className} {...props} />,
);
TableHeader.displayName = "Table.Header";

// Body
export const TableBody = forwardRef<HTMLTableSectionElement, ComponentPropsWithoutRef<"tbody">>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />,
);
TableBody.displayName = "Table.Body";

// Row
export const TableRow = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<"tr">>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={twMerge("group", className)} {...props} />
  ),
);
TableRow.displayName = "Table.Row";

// Head cell
export const TableHead = forwardRef<HTMLTableCellElement, ComponentPropsWithoutRef<"th">>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={twMerge(
        "border-b border-surface-700 bg-surface-800 px-2.5 py-2 text-left align-middle text-xs font-medium text-surface-400",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "Table.Head";

// Body cell
export const TableCell = forwardRef<HTMLTableCellElement, ComponentPropsWithoutRef<"td">>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={twMerge("border-b border-surface-700/40 px-2.5 py-2 align-top", className)}
      {...props}
    />
  ),
);
TableCell.displayName = "Table.Cell";

// Sort button — placed inside a Head cell to make a column sortable. Kept
// separate from Head so non-interactive affordances (e.g. a hint icon) can sit
// beside it without nesting buttons.
export interface TableSortButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Current sort of this column: `"asc"`, `"desc"`, or `false` when unsorted. */
  direction: "asc" | "desc" | false;
  children: ReactNode;
}

export const TableSortButton = forwardRef<HTMLButtonElement, TableSortButtonProps>(
  ({ direction, className, children, ...props }, ref) => {
    const Icon = match(direction)
      .with("asc", () => CaretUpIcon)
      .with("desc", () => CaretDownIcon)
      .otherwise(() => CaretUpDownIcon);

    return (
      <button
        ref={ref}
        type="button"
        className={twMerge(
          "group/sort inline-flex cursor-pointer items-center gap-1 rounded-sm transition-colors hover:text-surface-200",
          focusRing,
          direction && "text-surface-200",
          className,
        )}
        {...props}
      >
        {children}
        <Icon
          weight="bold"
          className={twMerge(
            "shrink-0",
            direction && "size-3.5 text-accent-400",
            !direction &&
              "size-3 text-surface-500 opacity-0 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100",
          )}
        />
      </button>
    );
  },
);
TableSortButton.displayName = "Table.SortButton";

/**
 * The parts of a native table, for rows a reader compares down a column.
 *
 * `DataTable` adds sorting and a column model over these parts. A table whose reader arranges
 * its columns, groups its rows and picks them is the arranged table.
 */
export const Table = {
  Root: TableRoot,
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Head: TableHead,
  Cell: TableCell,
  SortButton: TableSortButton,
};
