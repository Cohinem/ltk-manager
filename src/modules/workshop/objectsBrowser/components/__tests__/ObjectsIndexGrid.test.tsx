// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { ObjectTreeNode } from "../../utils/objectTree";
import type { ProjectObject } from "../../utils/projectObjects";
import { ObjectsIndexGrid } from "../ObjectsIndexGrid";

const state = vi.hoisted(() => ({
  dir: { isPending: true } as Record<string, unknown>,
  projectObjects: [] as ProjectObject[],
}));

vi.mock("../../api/useObjectDir", () => ({ useObjectDir: () => state.dir }));
vi.mock("../../api/useObjectIndex", () => ({ useWarmOnAbsent: () => vi.fn() }));
vi.mock("../../hooks/useLayerDeclarations", () => ({ useLayerDeclarations: () => new Map() }));
vi.mock("../../hooks/useProjectObjects", () => ({
  useProjectObjects: () => state.projectObjects,
}));
vi.mock("../ObjectsGrid", () => ({
  ObjectsGrid: ({ nodes }: { nodes: readonly ObjectTreeNode[] }) => (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>{node.id}</li>
      ))}
    </ul>
  ),
}));

afterEach(() => {
  cleanup();
  state.dir = { isPending: true };
  state.projectObjects = [];
});

it("lists the project's own objects under a prefix the index does not hold", () => {
  state.dir = { isPending: false, isError: true, error: { code: "INVALID_PATH", message: "" } };
  state.projectObjects = [
    { objectHash: "0x00000001", path: "Characters/Mine/Skins/Skin0" },
    { objectHash: "0x00000002", path: "Characters/Mine/Skins/Skin0/Particles/Burst" },
  ];
  render(
    <ObjectsIndexGrid
      prefix="Characters/Mine/Skins"
      size={128}
      thumbnails
      onDescend={vi.fn()}
      onUp={vi.fn()}
      canGoUp
    />,
  );

  expect(screen.getByText("Characters/Mine/Skins/Skin0")).toBeInTheDocument();
  expect(screen.getByText("1 items")).toBeInTheDocument();
});

it("exposes every segment of a folded path and navigates directly to its ancestors", () => {
  const descend = vi.fn();
  const up = vi.fn();
  render(
    <ObjectsIndexGrid
      prefix="Characters/AnnieTibbers/Skins"
      size={128}
      thumbnails
      onDescend={descend}
      onUp={up}
      canGoUp
    />,
  );
  const trail = screen.getByRole("navigation");
  expect(within(trail).getByRole("button", { name: "Skins" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  fireEvent.click(within(trail).getByRole("button", { name: "Characters" }));
  expect(descend).toHaveBeenLastCalledWith("Characters");
  fireEvent.click(within(trail).getByRole("button", { name: "AnnieTibbers" }));
  expect(descend).toHaveBeenLastCalledWith("Characters/AnnieTibbers");
  fireEvent.click(within(trail).getByRole("button", { name: "Objects" }));
  expect(descend).toHaveBeenLastCalledWith("");
  fireEvent.click(screen.getByRole("button", { name: "Up" }));
  expect(up).toHaveBeenCalledOnce();
});

it("disables parent navigation at the root", () => {
  render(
    <ObjectsIndexGrid
      prefix=""
      size={128}
      thumbnails
      onDescend={vi.fn()}
      onUp={vi.fn()}
      canGoUp={false}
    />,
  );
  expect(screen.getByRole("button", { name: "Up" })).toBeDisabled();
  expect(
    within(screen.getByRole("navigation")).getByRole("button", { name: "Objects" }),
  ).toHaveAttribute("aria-current", "page");
});
