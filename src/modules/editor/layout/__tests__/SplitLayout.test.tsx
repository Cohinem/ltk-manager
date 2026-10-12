// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SplitLayout } from "../SplitLayout";
import type { LayoutNode, LeafNode } from "../tree";

const TREE: LayoutNode = {
  kind: "split",
  id: "split-1",
  dir: "row",
  children: [
    { kind: "leaf", id: "leaf-1", tabs: ["details"], activeTab: "details" },
    { kind: "leaf", id: "leaf-2", tabs: ["files:base"], activeTab: "files:base" },
  ],
};

function renderLeaf(leaf: LeafNode) {
  return <div key={leaf.id} data-testid={`body-${leaf.id}`} />;
}

function draw(maximizedLeafId?: string | null, onRestore?: () => void) {
  render(
    <SplitLayout
      node={TREE}
      onLayoutChanged={() => {}}
      renderLeaf={renderLeaf}
      maximizedLeafId={maximizedLeafId}
      onRestore={onRestore}
    />,
  );
}

describe("SplitLayout", () => {
  it("draws both leaves of a split", () => {
    draw(null);

    expect(screen.getByTestId("body-leaf-1")).toBeInTheDocument();
    expect(screen.getByTestId("body-leaf-2")).toBeInTheDocument();
  });

  it("gives separately mounted trees distinct resize group identities", () => {
    draw(null);
    draw(null);

    const ids = [...document.querySelectorAll<HTMLElement>("[data-group]")].map(
      (group) => group.id,
    );

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("replaces the resize group identity when pane topology changes", () => {
    const { container, rerender } = render(
      <SplitLayout node={TREE} onLayoutChanged={() => {}} renderLeaf={renderLeaf} />,
    );
    const firstId = container.querySelector<HTMLElement>("[data-group]")?.id;

    const changed: LayoutNode = {
      ...TREE,
      children: [
        TREE.children[0]!,
        { kind: "leaf", id: "leaf-3", tabs: ["outline"], activeTab: "outline" },
      ],
    };
    rerender(<SplitLayout node={changed} onLayoutChanged={() => {}} renderLeaf={renderLeaf} />);

    expect(container.querySelector<HTMLElement>("[data-group]")?.id).not.toBe(firstId);
  });

  it("draws a maximized leaf alone", () => {
    draw("leaf-2");

    expect(screen.getByTestId("body-leaf-2")).toBeInTheDocument();
    expect(screen.queryByTestId("body-leaf-1")).not.toBeInTheDocument();
  });

  it("draws the tree for an id it does not hold", () => {
    draw("leaf-99");

    expect(screen.getByTestId("body-leaf-1")).toBeInTheDocument();
    expect(screen.getByTestId("body-leaf-2")).toBeInTheDocument();
  });

  it("gives the tree back on Escape while a leaf is maximized", async () => {
    const restore = vi.fn();
    draw("leaf-2", restore);

    await userEvent.keyboard("{Escape}");

    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape alone while the tree draws whole", async () => {
    const restore = vi.fn();
    draw(null, restore);

    await userEvent.keyboard("{Escape}");

    expect(restore).not.toHaveBeenCalled();
  });
});

describe("SplitLayout collapse", () => {
  const layout = { "leaf-1": 5, "leaf-2": 95 };
  const column: LayoutNode = { ...TREE, dir: "col", layout };

  const observed = new Map<ResizeObserverCallback, Set<Element>>();

  class FiringResizeObserver {
    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observed.set(callback, new Set());
    }

    observe(target: Element) {
      observed.get(this.callback)?.add(target);
    }

    unobserve(target: Element) {
      observed.get(this.callback)?.delete(target);
    }

    disconnect() {
      observed.delete(this.callback);
    }
  }

  /* The library reports a panel's resize from a ResizeObserver, which happy-dom never fires. */
  function fireResizes() {
    act(() => {
      for (const [callback, targets] of observed) {
        const entries = [...targets].map((target) => ({
          target,
          borderBoxSize: [{ inlineSize: 300, blockSize: 300 }],
        }));

        callback(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      }
    });
  }

  /* The library sizes a group by its panels' offsets, which happy-dom reports as zero. */
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
    vi.stubGlobal("ResizeObserver", FiringResizeObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    observed.clear();
  });

  function drawCollapsed(node: LayoutNode) {
    const onLayoutChanged = vi.fn();

    render(
      <SplitLayout
        node={node}
        onLayoutChanged={onLayoutChanged}
        renderLeaf={renderLeaf}
        collapsedSize={30}
        renderCollapsedLeaf={(leaf) => <div data-testid={`rail-${leaf.id}`} />}
      />,
    );

    return onLayoutChanged;
  }

  it("draws a rail over a leaf collapsed in a row, and keeps the leaf mounted", () => {
    drawCollapsed({ ...TREE, layout });
    fireResizes();

    expect(screen.getByTestId("rail-leaf-1")).toBeInTheDocument();
    expect(screen.queryByTestId("rail-leaf-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("body-leaf-1")).toBeInTheDocument();
  });

  it("draws no rail over a leaf collapsed in a column, which keeps its strip", () => {
    drawCollapsed(column);
    fireResizes();

    expect(screen.queryByTestId("rail-leaf-1")).not.toBeInTheDocument();
  });

  it("expands a leaf collapsed in a row on a click in its rail, and stores it", async () => {
    const onLayoutChanged = drawCollapsed({ ...TREE, layout });
    fireResizes();

    await userEvent.click(screen.getByTestId("rail-leaf-1"));
    fireResizes();

    expect(onLayoutChanged).toHaveBeenCalledWith("split-1", { "leaf-1": 50, "leaf-2": 50 });
    expect(screen.queryByTestId("rail-leaf-1")).not.toBeInTheDocument();
  });

  it("expands a collapsed leaf of a column to an even share on a click, and stores it", async () => {
    const onLayoutChanged = drawCollapsed(column);

    await userEvent.click(screen.getByTestId("body-leaf-1"));

    expect(onLayoutChanged).toHaveBeenCalledWith("split-1", { "leaf-1": 50, "leaf-2": 50 });
  });

  it("expands a collapsed split of a column on a click in one of its leaves", async () => {
    const onLayoutChanged = drawCollapsed({
      kind: "split",
      id: "split-9",
      dir: "col",
      layout: { "split-1": 5, "leaf-3": 95 },
      children: [TREE, { kind: "leaf", id: "leaf-3", tabs: ["outline"], activeTab: "outline" }],
    });

    await userEvent.click(screen.getByTestId("body-leaf-1"));

    expect(onLayoutChanged).toHaveBeenCalledWith("split-9", { "split-1": 50, "leaf-3": 50 });
  });
});
