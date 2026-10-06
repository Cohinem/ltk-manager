// @vitest-environment happy-dom

import { DndContext } from "@dnd-kit/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PaneStrip, type PaneStripProps } from "../PaneStrip";

const PANES = [
  { id: "graph", title: "Graph" },
  { id: "preview", title: "Preview" },
];

function draw(props: Partial<PaneStripProps> = {}) {
  render(
    <DndContext>
      <PaneStrip leafId="leaf-1" panes={PANES} activeId="graph" onActivate={() => {}} {...props} />
    </DndContext>,
  );
}

function tabOf(title: string): HTMLElement {
  const tab = screen.getByRole("tab", { name: title }).parentElement;
  if (tab === null) throw new Error(`no tab named ${title}`);
  return tab;
}

describe("PaneStrip", () => {
  it("floats the open pane from the button on its tab, which no other tab carries", () => {
    const onFloat = vi.fn();
    draw({ onFloat });

    expect(screen.queryByRole("button", { name: "Float Preview" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Float Graph" }));

    expect(onFloat).toHaveBeenCalledWith("graph");
  });

  it("floats a pane that is not the open one from its tab's menu", async () => {
    const onFloat = vi.fn();
    draw({ onFloat, onClose: () => {} });

    fireEvent.contextMenu(tabOf("Preview"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Float" }));

    expect(onFloat).toHaveBeenCalledWith("preview");
  });

  it("offers Maximize on a tab's menu, and Restore where its leaf fills the shell", async () => {
    const onMaximize = vi.fn();
    draw({ onMaximize, maximized: true });

    fireEvent.contextMenu(tabOf("Graph"));
    expect(screen.queryByRole("menuitem", { name: "Maximize" })).toBeNull();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore" }));

    expect(onMaximize).toHaveBeenCalledTimes(1);
  });

  it("closes a pane from its tab's menu", async () => {
    const onClose = vi.fn();
    draw({ onClose });

    fireEvent.contextMenu(tabOf("Preview"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Close" }));

    expect(onClose).toHaveBeenCalledWith("preview");
  });

  it("draws a tab with no menu where the host passes no action for one", () => {
    draw();

    fireEvent.contextMenu(tabOf("Graph"));

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
