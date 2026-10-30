// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BankEdit, EventNode, ObjectProperties } from "@/lib/tauri";

import type { EventRow } from "../../utils/eventTree";
import { RowPlates, type TreeEditing } from "../EventPlates";

afterEach(cleanup);

const SOUND: EventNode = {
  kind: "sound",
  id: 103,
  source: 486,
  stream: "streaming",
  media: null,
};

const RANDOM: EventNode = {
  kind: "random",
  id: 414,
  children: [SOUND],
  mode: "random",
  playlist: [{ child: 0, weight: 1 }],
};

const SOUND_PROPERTIES: ObjectProperties = {
  id: 103,
  editable: true,
  values: [
    { property: "volume", value: -3 },
    { property: "loopCount", value: 1 },
  ],
  weights: null,
};

const RANDOM_PROPERTIES: ObjectProperties = {
  id: 414,
  editable: true,
  values: [],
  weights: { weighted: false, items: [{ child: 103, weight: 30_000 }] },
};

function rowOf(node: EventNode, key: string, parent: string | null): EventRow {
  return { kind: "node", key, depth: 2, parent, expandable: false, node };
}

function renderPlates(edit: (edit: BankEdit) => Promise<boolean>) {
  const editing: TreeEditing = {
    revision: { id: 1, revision: 0 },
    properties: new Map([
      [103, SOUND_PROPERTIES],
      [414, RANDOM_PROPERTIES],
    ]),
    edited: new Set(),
    edit,
  };
  render(
    <RowPlates
      row={rowOf(SOUND, "e1/0.0.0", "e1/0.0")}
      parent={rowOf(RANDOM, "e1/0.0", "e1/0")}
      editing={editing}
      onLeave={() => {}}
    />,
  );
}

describe("RowPlates", () => {
  it("commits the typed volume on Enter", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderPlates(edit);
    const volume = screen.getByRole("textbox", { name: "Volume" });
    volume.focus();

    fireEvent.change(volume, { target: { value: "-6.5" } });
    fireEvent.keyDown(volume, { key: "Enter" });

    expect(edit).toHaveBeenCalledExactlyOnceWith({
      kind: "property",
      object: 103,
      property: "volume",
      value: -6.5,
    });
  });

  it("drops the typed text on Escape without an edit", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderPlates(edit);
    const volume = screen.getByRole("textbox", { name: "Volume" });
    volume.focus();

    fireEvent.change(volume, { target: { value: "12" } });
    fireEvent.keyDown(volume, { key: "Escape" });

    expect(edit).not.toHaveBeenCalled();
    expect(volume).toHaveValue("-3");
  });

  it("marks a text that holds no number without an edit", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderPlates(edit);
    const loop = screen.getByRole("textbox", { name: "Loop Count" });
    loop.focus();

    fireEvent.change(loop, { target: { value: "forever" } });
    fireEvent.keyDown(loop, { key: "Enter" });

    expect(edit).not.toHaveBeenCalled();
    expect(loop).toHaveAttribute("aria-invalid", "true");
    expect(loop).toHaveValue("forever");
  });

  it("marks a value that the backend refused and keeps its text", async () => {
    const edit = vi.fn(() => Promise.resolve(false));
    renderPlates(edit);
    const source = screen.getByRole("textbox", { name: "Source" });
    source.focus();

    fireEvent.change(source, { target: { value: "42" } });
    fireEvent.keyDown(source, { key: "Enter" });

    expect(edit).toHaveBeenCalledExactlyOnceWith({ kind: "source", sound: 103, source: 42 });
    await waitFor(() => expect(source).toHaveAttribute("aria-invalid", "true"));
    expect(source).toHaveValue("42");
  });

  it("sets the child's playlist weight in Wwise units", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderPlates(edit);
    const weight = screen.getByRole("textbox", { name: "Weight" });
    expect(weight).toHaveValue("30");
    weight.focus();

    fireEvent.change(weight, { target: { value: "75" } });
    fireEvent.keyDown(weight, { key: "Enter" });

    expect(edit).toHaveBeenCalledExactlyOnceWith({
      kind: "weight",
      container: 414,
      child: 103,
      weight: 75_000,
    });
  });
});
