// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { selectedOfItem, useExplorerSelectionApi } from "../../hooks/useExplorer";
import { useExplorerStore } from "../../state/explorer";
import type { ExplorerItem } from "../../utils/items";
import { sortItems } from "../../utils/sort";
import { ExplorerDetails } from "../ExplorerDetails";
import { ExplorerSortScope, useExplorerSort } from "../ExplorerSortScope";

vi.mock("../../../projects/state/ProjectContext", () => ({
  useProjectContext: () => ({ path: "details-project" }),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    measure: () => {},
    scrollToIndex: () => {},
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        start: index * estimateSize(),
      })),
  }),
}));

const data: ExplorerItem[] = [
  { kind: "dir", id: "alpha", name: "Alpha", fileCount: 4 },
  { kind: "dir", id: "beta", name: "Beta", fileCount: 2 },
];
const descend = vi.fn();
function Details() {
  const sort = useExplorerSort();
  const items = sortItems(data, sort);
  const selection = useExplorerSelectionApi("details-test", items.map(selectedOfItem));
  return (
    <ExplorerDetails
      items={items}
      selection={selection}
      thumbnails={false}
      ariaLabel="Files"
      onDescend={descend}
      onOpen={() => {}}
      onUp={() => {}}
      assetOf={() => null}
    />
  );
}

beforeEach(() => {
  useExplorerStore.setState({ sorts: {}, selections: {} });
  descend.mockClear();
});

it("sorts through the header while retaining selection and opening a directory", async () => {
  const user = userEvent.setup();
  render(
    <ExplorerSortScope documentId="game">
      <Details />
    </ExplorerSortScope>,
  );
  await user.click(screen.getByText("Beta"));
  expect(screen.getByText("Beta").closest("[role=row]")).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("button", { name: "Name" }));
  expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Beta");
  expect(screen.getByText("Beta").closest("[role=row]")).toHaveAttribute("aria-selected", "true");
  await user.dblClick(screen.getByText("Beta"));
  expect(descend).toHaveBeenCalledWith("beta");
});
