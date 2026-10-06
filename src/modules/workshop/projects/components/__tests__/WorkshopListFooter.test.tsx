// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { WorkshopProject } from "@/lib/tauri";
import { workshopKeys } from "@/modules/workshop";
import { createTestQueryClient } from "@/test/utils";

import { useWorkshopFilterStore } from "../../state/workshopFilter";
import { useWorkshopSelectionStore } from "../../state/workshopSelection";
import { WorkshopListFooter } from "../WorkshopControls";

function project(name: string): WorkshopProject {
  return {
    path: `X:/mods/${name}`,
    name,
    displayName: name,
    version: "1.0.0",
    description: "",
    authors: [],
    tags: [],
    champions: [],
    maps: [],
    layers: [],
    thumbnailPath: null,
    lastModified: "2026-08-21T21:14:02Z",
    location: "workshop",
    lastOpened: null,
    id: `id-${name}`,
  };
}

const PROJECTS = [project("one"), project("two"), project("three")];

function renderFooter() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(workshopKeys.projects(), PROJECTS);

  function Providers({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(<WorkshopListFooter />, { wrapper: Providers });
}

function pick(...names: string[]) {
  useWorkshopSelectionStore.setState({
    selectedPaths: new Set(names.map((name) => `X:/mods/${name}`)),
  });
}

describe("WorkshopListFooter", () => {
  beforeEach(() => {
    useWorkshopFilterStore.setState({ viewMode: "grid", searchQuery: "" });
    useWorkshopSelectionStore.setState({ selectedPaths: new Set() });
  });

  it("counts the projects the list draws", () => {
    renderFooter();

    expect(screen.getByText("3 projects")).toBeInTheDocument();
  });

  it("counts the matches out of the projects while a search narrows the list", () => {
    useWorkshopFilterStore.setState({ searchQuery: "tw" });

    renderFooter();

    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("draws no selection menu while nothing is picked", () => {
    renderFooter();

    expect(screen.queryByRole("button", { name: /selected/ })).not.toBeInTheDocument();
  });

  it("opens the commands of the picks from their count", async () => {
    pick("one", "three");
    renderFooter();

    await userEvent.click(screen.getByRole("button", { name: "2 selected" }));

    expect(screen.getByRole("menuitem", { name: "Pack 2" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear selection" })).toBeInTheDocument();
  });

  it("picks every drawn project from the grid's footer", async () => {
    renderFooter();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select all visible projects" }));

    expect(useWorkshopSelectionStore.getState().selectedPaths.size).toBe(3);
  });

  it("leaves select all to the header while the table is up", () => {
    useWorkshopFilterStore.setState({ viewMode: "table" });

    renderFooter();

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("switches the list to the table", async () => {
    renderFooter();

    await userEvent.click(screen.getByRole("button", { name: "Table view" }));

    expect(useWorkshopFilterStore.getState().viewMode).toBe("table");
  });
});
