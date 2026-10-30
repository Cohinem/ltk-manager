// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BankEdit, EventNode, ObjectProperties } from "@/lib/tauri";

import { nodeFields } from "../../utils/nodeFields";
import type { TreeEditing } from "../../utils/treeEditing";
import { FieldValue } from "../FieldRows";

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

const PROPERTIES = new Map<number, ObjectProperties>([
  [
    103,
    {
      id: 103,
      editable: true,
      values: [
        { property: "volume", value: -3 },
        { property: "loopCount", value: 1 },
      ],
      weights: null,
    },
  ],
  [
    414,
    {
      id: 414,
      editable: true,
      values: [],
      weights: { weighted: false, items: [{ child: 103, weight: 30_000 }] },
    },
  ],
]);

/** Draws the value cell of the field `name` of the sound, which edits through `edit`. */
function renderField(name: string, edit: (edit: BankEdit) => Promise<boolean>) {
  const field = nodeFields({ kind: "node", node: SOUND }, PROPERTIES, RANDOM).find(
    (each) => each.name === name,
  );
  if (field === undefined) throw new Error(`No field ${name}`);

  const editing: TreeEditing = {
    revision: { id: 1, revision: 0 },
    properties: PROPERTIES,
    edited: new Set(),
    edit,
  };
  render(<FieldValue field={field} editing={editing} onLeave={() => {}} />);
}

describe("FieldValue", () => {
  it("commits the typed volume on Enter", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("volume", edit);
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
    renderField("volume", edit);
    const volume = screen.getByRole("textbox", { name: "Volume" });
    volume.focus();

    fireEvent.change(volume, { target: { value: "12" } });
    fireEvent.keyDown(volume, { key: "Escape" });

    expect(edit).not.toHaveBeenCalled();
    expect(volume).toHaveValue("-3");
  });

  it("marks a text that holds no number without an edit", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("loopCount", edit);
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
    renderField("source", edit);
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
    renderField("weight", edit);
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

  it("sends one edit at the end of a knob key run", () => {
    vi.useFakeTimers();
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("volume", edit);
    const knob = screen.getByRole("slider", { name: "Volume knob" });

    fireEvent.keyDown(knob, { key: "ArrowUp" });
    fireEvent.keyDown(knob, { key: "ArrowUp" });
    fireEvent.keyUp(knob, { key: "ArrowUp" });
    vi.runAllTimers();
    vi.useRealTimers();

    expect(edit).toHaveBeenCalledExactlyOnceWith({
      kind: "property",
      object: 103,
      property: "volume",
      value: -2,
    });
  });
});
