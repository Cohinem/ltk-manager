// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChangeViewStore } from "../../../../documents/state/changeView";
import { useInspectorViewStore } from "../../state/inspectorView";
import { InspectorActions } from "../InspectorActions";

const clipboard = vi.hoisted(() => ({
  copy: vi.fn(async () => {}),
  duplicate: vi.fn(async () => {}),
  paste: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  land: null,
}));

vi.mock("../../../clipboard/useEmitterClipboard", () => ({
  useEmitterClipboard: () => clipboard,
}));

vi.mock("../../../templates/TemplateMenus", () => ({
  TemplateSubmenu: () => null,
}));

vi.mock("../../state/emitterChoice", () => ({
  useEmitters: () => ({
    card: { key: "c0", row: { entry: "0x1", path: "list[0]", name: "Spark" }, groups: [] },
    child: null,
    target: "emitter",
  }),
}));

vi.mock("../../utils/emitterCards", () => ({ nameOf: () => "Spark" }));

beforeEach(() => {
  vi.clearAllMocks();
  useInspectorViewStore.setState({ definedOnly: false, preview: true });
  useChangeViewStore.setState({ marks: true, changedOnly: false, baseline: "opened" });
});

function draw(adding: boolean | null = false) {
  const onAddingChange = vi.fn();
  render(<InspectorActions adding={adding} onAddingChange={onAddingChange} />);
  return onAddingChange;
}

describe("InspectorActions", () => {
  it("draws three controls: Add property, the View menu and the Emitter menu", () => {
    draw();

    const toolbar = screen.getByRole("toolbar", { name: "Inspector actions" });

    expect(toolbar.querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add property" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Emitter" })).toBeInTheDocument();
  });

  it("draws no Add property where the emitter takes no add", () => {
    draw(null);

    expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();
  });

  it("holds the defined filter, the preview and the change marks in the View menu", async () => {
    draw();

    await userEvent.click(screen.getByRole("button", { name: "View" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Defined only" }));

    expect(useInspectorViewStore.getState().definedOnly).toBe(true);
    expect(screen.getByRole("menuitemcheckbox", { name: "Preview" })).toBeChecked();
    expect(screen.getByRole("menuitemcheckbox", { name: "Marks" })).toBeChecked();
    expect(screen.getByRole("menuitemcheckbox", { name: "Changed only" })).not.toBeChecked();
  });

  it("presses the View button while a filter hides rows", () => {
    useChangeViewStore.setState({ changedOnly: true });
    draw();

    expect(screen.getByRole("button", { name: "View" })).toHaveAttribute("data-pressed");
  });

  it("holds the emitter's duplicate, copy, paste and delete in the Emitter menu", async () => {
    draw();

    await userEvent.click(screen.getByRole("button", { name: "Emitter" }));
    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Paste" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(clipboard.remove).toHaveBeenCalledWith({ entry: "0x1", wire: "list[0]", name: "Spark" });
  });
});
