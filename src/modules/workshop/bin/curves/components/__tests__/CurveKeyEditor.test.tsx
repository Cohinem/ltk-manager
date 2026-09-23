// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CurveKey } from "../../../values/utils/valueRows";
import { CurveKeyEditor } from "../CurveKeyEditor";

const KEYS: CurveKey[] = [
  { time: 0, values: [0, 1, 2] },
  { time: 1, values: [3, 4, 5] },
];

describe("CurveKeyEditor", () => {
  it("edits the selected key's time and channels with stepped fields", async () => {
    const onCommit = vi.fn();
    render(
      <CurveKeyEditor
        keys={KEYS}
        family="vector"
        selected={[1]}
        unit={null}
        editable
        onSelect={() => {}}
        onCommit={onCommit}
      />,
    );
    const user = userEvent.setup();

    const time = screen.getByRole("textbox", { name: "Lifetime" });
    await user.clear(time);
    await user.type(time, "0.75");
    fireEvent.blur(time);
    expect(onCommit).toHaveBeenLastCalledWith({ time: 0.75, values: [3, 4, 5] });

    const x = screen.getByRole("textbox", { name: "X" });
    await user.clear(x);
    await user.type(x, "8");
    fireEvent.blur(x);
    expect(onCommit).toHaveBeenLastCalledWith({ time: 0.75, values: [8, 4, 5] });
  });

  it("snaps committed values to clean channel increments", async () => {
    const onCommit = vi.fn();
    render(
      <CurveKeyEditor
        keys={[
          { time: 0, values: [0] },
          { time: 1, values: [5] },
        ]}
        family="scalar"
        selected={[1]}
        unit={null}
        editable
        onSelect={() => {}}
        onCommit={onCommit}
      />,
    );
    const input = screen.getByRole("textbox", { name: "value" });
    const user = userEvent.setup();

    await user.clear(input);
    await user.type(input, "1.7519038572");
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenLastCalledWith({ time: 1, values: [1.75] });
    expect(input).toHaveValue("1.750");
  });

  it("walks the key selection from the compact header", async () => {
    const onSelect = vi.fn();
    render(
      <CurveKeyEditor
        keys={KEYS}
        family="vector"
        selected={[0]}
        unit={null}
        editable
        onSelect={onSelect}
        onCommit={() => {}}
      />,
    );

    expect(screen.getByText("Key 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select previous key" })).toBeDisabled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Select next key" }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("moves below the graph when its container is narrow", () => {
    render(
      <CurveKeyEditor
        keys={KEYS}
        family="vector"
        selected={[0]}
        unit={null}
        editable
        onSelect={() => {}}
        onCommit={() => {}}
      />,
    );

    expect(screen.getByRole("complementary")).toHaveClass(
      "w-full",
      "border-t",
      "@min-[34rem]:w-52",
      "@min-[34rem]:border-l",
    );
  });

  it("offers the colour picker beside normalized channel fields", () => {
    render(
      <CurveKeyEditor
        keys={[{ time: 0, values: [1, 0.5, 0, 1] }]}
        family="color"
        selected={[0]}
        unit={null}
        editable
        onSelect={() => {}}
        onCommit={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "#FF8000FF" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "A" })).toHaveValue("1.000");
  });

  it("summarizes a multi-key selection instead of showing one key's fields", () => {
    render(
      <CurveKeyEditor
        keys={KEYS}
        family="vector"
        selected={[0, 1]}
        unit={null}
        editable
        onSelect={() => {}}
        onCommit={() => {}}
      />,
    );

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(
      screen.getByText("Delete the selection together, or click one key to edit it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
