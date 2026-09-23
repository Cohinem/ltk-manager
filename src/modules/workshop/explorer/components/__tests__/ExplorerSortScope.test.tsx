// @vitest-environment happy-dom

import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExplorerStore } from "../../state/explorer";
import { ExplorerSortScope, useExplorerSort, useSetExplorerSort } from "../ExplorerSortScope";

const project = vi.hoisted(() => ({ path: "project-a" }));
vi.mock("../../../projects/state/ProjectContext", () => ({
  useProjectContext: () => project,
}));

beforeEach(() => {
  project.path = "project-a";
  useExplorerStore.setState({ sorts: {} });
});

describe("explorer sort ownership", () => {
  it("changes only the active tab and leaves sidebar subscribers idle", async () => {
    const sidebarRender = vi.fn();
    function Sort({ name }: { name: string }) {
      const sort = useExplorerSort();
      const setSort = useSetExplorerSort();
      if (name === "sidebar") sidebarRender();
      return (
        <button onClick={() => setSort({ field: "size", direction: "desc" })}>
          {name}: {sort.field}
        </button>
      );
    }
    render(
      <>
        <Sort name="sidebar" />
        <ExplorerSortScope documentId="game">
          <Sort name="game" />
        </ExplorerSortScope>
        <ExplorerSortScope documentId="wad-a">
          <Sort name="wad-a" />
        </ExplorerSortScope>
        <ExplorerSortScope documentId="wad-b">
          <Sort name="wad-b" />
        </ExplorerSortScope>
      </>,
    );
    const renders = sidebarRender.mock.calls.length;
    await userEvent.setup().click(screen.getByRole("button", { name: "game: name" }));
    expect(screen.getByRole("button", { name: "game: size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sidebar: name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "wad-a: name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "wad-b: name" })).toBeInTheDocument();
    expect(sidebarRender).toHaveBeenCalledTimes(renders);
    await userEvent.setup().click(screen.getByRole("button", { name: "wad-a: name" }));
    expect(screen.getByRole("button", { name: "wad-b: name" })).toBeInTheDocument();
    expect(sidebarRender).toHaveBeenCalledTimes(renders);
  });

  it("retains a tab's sort across remounts without sharing it with another project", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ExplorerSortScope documentId="game">{children}</ExplorerSortScope>
    );
    const first = renderHook(() => ({ sort: useExplorerSort(), set: useSetExplorerSort() }), {
      wrapper,
    });
    act(() => first.result.current.set({ field: "kind", direction: "desc" }));
    first.unmount();
    const reopened = renderHook(useExplorerSort, { wrapper });
    expect(reopened.result.current).toEqual({ field: "kind", direction: "desc" });
    reopened.unmount();
    project.path = "project-b";
    const other = renderHook(useExplorerSort, { wrapper });
    expect(other.result.current).toEqual({ field: "name", direction: "asc" });
  });
});
