// @vitest-environment happy-dom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DataTable, DataTableCells, type DataTableColumn } from "../DataTable";

interface Item {
  id: string;
  name: string;
  size: number;
}
const data: Item[] = [
  { id: "large", name: "Alpha", size: 20 },
  { id: "small", name: "Beta", size: 3 },
];
const columns: DataTableColumn<Item>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "size", header: "Size", sortDescFirst: false },
];
const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

describe("DataTable", () => {
  it("sorts numeric values and announces the direction", async () => {
    const user = userEvent.setup();
    render(<DataTable ariaLabel="Files" options={{ data, columns }} />);
    expect(names()).toEqual(["Alpha", "Beta"]);
    await user.click(screen.getByRole("button", { name: "Size" }));
    expect(names()).toEqual(["Beta", "Alpha"]);
    expect(screen.getByRole("columnheader", { name: "Size" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await user.click(screen.getByRole("button", { name: "Size" }));
    expect(names()).toEqual(["Alpha", "Beta"]);
    expect(screen.getByRole("columnheader", { name: "Size" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("keeps externally ordered rows while updating controlled sorting", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [sorting, setSorting] = useState([{ id: "name", desc: false }]);
      return (
        <DataTable
          ariaLabel="Files"
          options={{
            data,
            columns,
            manualSorting: true,
            state: { sorting },
            onSortingChange: setSorting,
          }}
        />
      );
    }
    render(<Controlled />);
    await user.click(screen.getByRole("button", { name: "Size" }));
    expect(names()).toEqual(["Alpha", "Beta"]);
    expect(screen.getByRole("columnheader", { name: "Size" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("refreshes custom cells when data and columns change", () => {
    const custom: DataTableColumn<Item>[] = [
      { id: "name", cell: ({ row }) => <span>{row.original.name}</span> },
    ];
    const view = (items: Item[], defs = custom) => (
      <DataTable
        ariaLabel="Files"
        options={{ data: items, columns: defs, getRowId: (item) => item.id }}
      >
        {(table) => (
          <div>
            {table.getRowModel().rows.map((row) => (
              <div key={row.id}>
                <DataTableCells row={row} customCells />
              </div>
            ))}
          </div>
        )}
      </DataTable>
    );
    const { rerender } = render(view(data));
    rerender(view([{ id: "large", name: "Updated", size: 7 }]));
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    rerender(view(data, [{ id: "size", cell: ({ row }) => <span>{row.original.size}</span> }]));
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });

  it("spans the columns with the supplied empty state", () => {
    render(<DataTable ariaLabel="Files" options={{ data: [], columns }} empty="No files" />);
    expect(screen.getByRole("cell", { name: "No files" })).toHaveAttribute("colspan", "2");
  });
});
