// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { create } from "zustand";

import { renderWithProviders } from "@/test/utils";

import { ArrangedTableOptions } from "../ArrangedTableOptions";
import { type TableLayoutState, tableLayoutSlice } from "../layout";

const COLUMNS = ["name", "author"] as const;
type Id = (typeof COLUMNS)[number];

const useStore = create<TableLayoutState<Id, "none" | "author">>()((set) =>
  tableLayoutSlice({ columns: COLUMNS, hidden: [], groupBy: "none" }, set),
);

const specs = {
  name: { id: "name", header: () => "Name", name: () => "Name", size: 100, required: true },
  author: { id: "author", header: () => "Author", name: () => "Author", size: 100 },
} as const;

describe("ArrangedTableOptions", () => {
  it("shows the row height it was just set to", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ArrangedTableOptions
        store={useStore}
        specs={specs}
        groupLabels={{ none: () => "None", author: () => "Author" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Compact" }));

    expect(useStore.getState().density).toBe("compact");
    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
  });
});
