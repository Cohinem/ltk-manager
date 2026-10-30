// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BankEdit, EventNode, ObjectProperties } from "@/lib/tauri";

import { type NodeField, nodeFields } from "../../utils/nodeFields";
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

/** The tree's part: which field's entry is open. */
function Harness({ field, editing }: { field: NodeField; editing: TreeEditing }) {
  const [entering, setEntering] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setEntering(true)}>
        F2
      </button>
      <FieldValue
        field={field}
        editing={editing}
        entering={entering}
        onEntering={setEntering}
        onLeave={() => {}}
      />
    </>
  );
}

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
  render(<Harness field={field} editing={editing} />);
}

describe("FieldValue", () => {
  it("draws the value as text with no box at rest", () => {
    renderField("volume", vi.fn());

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("-3.0")).toBeDefined();
  });

  it("commits a value typed with its unit in the entry a double click on the knob opens", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("volume", edit);

    fireEvent.doubleClick(screen.getByRole("slider", { name: "Volume knob" }));
    const entry = screen.getByRole("textbox", { name: "Volume knob" });
    expect(entry).toHaveValue("-3");

    fireEvent.change(entry, { target: { value: "-6.5 dB" } });
    fireEvent.keyDown(entry, { key: "Enter" });

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

    fireEvent.doubleClick(screen.getByRole("slider", { name: "Volume knob" }));
    const entry = screen.getByRole("textbox", { name: "Volume knob" });
    fireEvent.change(entry, { target: { value: "12" } });
    fireEvent.keyDown(entry, { key: "Escape" });

    expect(edit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("resets the knob to 0 on Alt+click and on Delete, one edit each", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("volume", edit);
    const knob = screen.getByRole("slider", { name: "Volume knob" });

    fireEvent.pointerDown(knob, { button: 0, altKey: true });
    expect(edit).toHaveBeenCalledExactlyOnceWith({
      kind: "property",
      object: 103,
      property: "volume",
      value: 0,
    });

    cleanup();
    edit.mockClear();
    renderField("volume", edit);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume knob" }), { key: "Delete" });
    expect(edit).toHaveBeenCalledOnce();
  });

  it("opens a field without a knob in place and keeps a refused value marked", async () => {
    const edit = vi.fn(() => Promise.resolve(false));
    renderField("source", edit);

    fireEvent.click(screen.getByRole("button", { name: "F2" }));
    const source = screen.getByRole("textbox", { name: "Source" });
    expect(source).toHaveValue("486");

    fireEvent.change(source, { target: { value: "42" } });
    fireEvent.keyDown(source, { key: "Enter" });
    expect(edit).toHaveBeenCalledExactlyOnceWith({ kind: "source", sound: 103, source: 42 });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Source" })).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(screen.getByRole("textbox", { name: "Source" })).toHaveValue("42");
  });

  it("keeps a text that holds no number open and marked on Enter", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("loopCount", edit);

    fireEvent.click(screen.getByRole("button", { name: "F2" }));
    const loop = screen.getByRole("textbox", { name: "Loop Count" });
    fireEvent.change(loop, { target: { value: "forever" } });
    fireEvent.keyDown(loop, { key: "Enter" });

    expect(edit).not.toHaveBeenCalled();
    expect(loop).toHaveAttribute("aria-invalid", "true");
  });

  it("sets the child's playlist weight in Wwise units", () => {
    const edit = vi.fn(() => Promise.resolve(true));
    renderField("weight", edit);

    fireEvent.doubleClick(screen.getByRole("slider", { name: "Weight knob" }));
    const weight = screen.getByRole("textbox", { name: "Weight knob" });
    expect(weight).toHaveValue("30");
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
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();

    expect(edit).toHaveBeenCalledExactlyOnceWith({
      kind: "property",
      object: 103,
      property: "volume",
      value: -2,
    });
  });
});
