// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ObjectsIndexGrid } from "../ObjectsIndexGrid";

vi.mock("../../api/useObjectDir", () => ({ useObjectDir: () => ({ isPending: true }) }));
vi.mock("../../api/useObjectIndex", () => ({ useWarmOnAbsent: () => vi.fn() }));
vi.mock("../../hooks/useLayerDeclarations", () => ({ useLayerDeclarations: () => new Map() }));
vi.mock("../ObjectsGrid", () => ({ ObjectsGrid: () => null }));

afterEach(cleanup);

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
