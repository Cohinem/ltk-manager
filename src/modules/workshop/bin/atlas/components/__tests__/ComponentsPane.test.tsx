// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeclaredState } from "@/lib/tauri";

import { element, icon, scene, view } from "../../engine/__tests__/fixtures";
import { buildTree, type ViewTree } from "../../engine/model/tree";
import { type AtlasEdit, AtlasEditContext } from "../../state/atlasEdit";
import { useAtlasPreviewStore, viewKey } from "../../state/atlasPreview";
import { usePlacing } from "../../state/placing";
import { ComponentsPane } from "../ComponentsPane";

const read = vi.hoisted(() => ({
  tree: null as ViewTree | null,
  declared: null as DeclaredState | null,
}));

vi.mock("../../hooks/useAtlasSources", () => ({
  useAtlasView: () => ({
    view: read.tree?.view ?? null,
    tree: read.tree,
    error: null,
    pending: false,
  }),
}));
vi.mock("../../../documents/hooks/useDeclared", () => ({
  useDeclaredState: () => read.declared,
}));
vi.mock("../../hooks/useModFolder", () => ({ useModFolder: () => "Mods/test/" }));

const DOCUMENT = 4;
const ENTRY = "0x00000001";
const CREATED = "0x0000beef";
const VIEW = viewKey(DOCUMENT, ENTRY);

function hud(extra: string[] = []): ViewTree {
  return buildTree(
    view(
      [scene("hud", 0)],
      ["portrait", ...extra].map((key) => element(key, "hud", 2, icon())),
    ),
  );
}

/** What is being placed, as any other pane of the view reads it. */
function Carried() {
  const placing = usePlacing(VIEW);
  return <output>{placing === null ? "nothing" : `${placing.kind} ${placing.dragged}`}</output>;
}

function renderPane(edit: Partial<AtlasEdit> = {}) {
  const held: AtlasEdit = {
    scene: 9,
    variant: null,
    asset: null,
    editable: true,
    readOnly: null,
    apply: vi.fn(() => Promise.resolve(true)),
    create: vi.fn(() => Promise.resolve(CREATED)),
    remove: vi.fn(() => Promise.resolve(true)),
    ...edit,
  };
  const pane = () => (
    <AtlasEditContext value={{ ...held }}>
      <ComponentsPane document={DOCUMENT} entry={ENTRY} />
      <Carried />
    </AtlasEditContext>
  );
  return { edit: held, pane, ...render(pane()) };
}

const carried = () => screen.getByRole("status").textContent;

beforeEach(() => {
  read.tree = hud();
  read.declared = {} as DeclaredState;
  useAtlasPreviewStore.setState({ views: {}, foldedSections: [] });
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
});

describe("ComponentsPane", () => {
  it("picks a tile up on a click and lets go of it on the next", () => {
    const { edit } = renderPane();
    const tile = screen.getByRole("button", { name: "Image" });

    fireEvent.click(tile);
    expect(carried()).toBe("UiElementIconData false");
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Click the canvas or a layer to place Image")).toBeTruthy();

    fireEvent.click(tile);
    expect(carried()).toBe("nothing");
    expect(edit.create).not.toHaveBeenCalled();
  });

  it("lets go of the tile on Escape", () => {
    renderPane();
    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(carried()).toBe("nothing");
  });

  it("carries a tile the pointer leaves with the button down, until the button comes up", () => {
    renderPane();
    const tile = screen.getByRole("button", { name: "Region" });

    fireEvent.pointerDown(tile, { button: 0 });
    fireEvent.pointerLeave(tile, { buttons: 1 });
    expect(carried()).toBe("UiElementRegionData true");

    fireEvent.pointerUp(window);
    expect(carried()).toBe("nothing");
  });

  it("adds an element beside the selection on a double click, and selects it", async () => {
    const { edit, pane, rerender } = renderPane();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Image" }));

    await waitFor(() => expect(edit.apply).toHaveBeenCalledTimes(1));
    expect(edit.create).toHaveBeenCalledWith("Mods/test/hud/Image", {
      type: "class",
      class: "UiElementIconData",
    });
    const [edits] = vi.mocked(edit.apply).mock.calls[0] ?? [];
    expect(edits?.every((each) => each.entry === CREATED)).toBe(true);

    read.tree = hud([CREATED]);
    rerender(pane());
    await waitFor(() =>
      expect(useAtlasPreviewStore.getState().views[VIEW]?.selection).toEqual([CREATED]),
    );
  });

  it("lists the kinds a search finds", () => {
    renderPane();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cooldown" } });

    expect(screen.queryByRole("button", { name: "Image" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cooldown sweep" })).toBeTruthy();
  });

  it("picks nothing up in a file that is not declared", () => {
    read.declared = null;
    renderPane();

    const tile = screen.getByRole("button", { name: "Image" });
    fireEvent.click(tile);

    expect(tile.hasAttribute("disabled")).toBe(true);
    expect(carried()).toBe("nothing");
    expect(screen.getByText(/edited through declarations/)).toBeTruthy();
  });
});
