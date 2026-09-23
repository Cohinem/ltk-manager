// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import type { ProbabilityTable, ValueMark } from "../../../values/utils/valueRows";
import { randomDraw } from "../../utils/randomDraw";
import { CurveToolbar } from "../CurveToolbar";

function table(channel: number, keys: [number, number][]): ProbabilityTable {
  return { channel, single: 1, keys: keys.map(([time, value]) => ({ time, values: [value] })) };
}

function drawOf(tables: ProbabilityTable[], slots = tables.length) {
  const mark: ValueMark = {
    family: "vector",
    constant: { type: "vector", values: [1, 1, 1] },
    keys: [],
    tables,
    curve: true,
    slots,
  };
  return randomDraw(mark);
}

const GROWN = table(0, [
  [0, 0.5],
  [1, 1],
]);

function toolbar(over: Partial<Parameters<typeof CurveToolbar>[0]> = {}) {
  return (
    <CurveToolbar
      family="vector"
      width={3}
      muted={new Set()}
      onToggle={() => {}}
      draw={null}
      field={null}
      tab="graph"
      tabled
      onTab={() => {}}
      keyCount={2}
      selectedCount={1}
      editable
      onAdd={() => {}}
      onRemove={() => {}}
      {...over}
    />
  );
}

describe("CurveToolbar", () => {
  it("names each channel of a vector in the letters Riot labels them with, and mutes one", async () => {
    const onToggle = vi.fn();
    render(toolbar({ muted: new Set([1]), onToggle }));

    expect(screen.getByRole("button", { name: "X" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Y" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.setup().click(screen.getByRole("button", { name: "Z" }));

    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it("offers no chip on a scalar, which has one channel to tell apart from none", () => {
    render(toolbar({ family: "scalar", width: 1 }));

    expect(screen.queryByRole("button", { name: "value" })).toBeNull();
  });

  it("offers a Table only where there are keys to list", () => {
    const { rerender } = render(toolbar());
    expect(screen.getByRole("button", { name: "Table" })).toBeInTheDocument();

    rerender(toolbar({ tabled: false }));

    expect(screen.queryByRole("button", { name: "Table" })).toBeNull();
  });

  it("offers key insertion and removal from the graph toolbar", async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    render(toolbar({ onAdd, onRemove }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Add key" }));
    await user.click(screen.getByRole("button", { name: "Delete key" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("names the tables where the value has them", () => {
    const { rerender } = render(toolbar());
    expect(screen.queryByText("probabilityTables")).toBeNull();

    rerender(toolbar({ draw: drawOf([GROWN, table(1, []), table(2, [])]) }));

    expect(screen.getByText("probabilityTables")).toBeInTheDocument();
  });

  it("warns of a random table on a value drawn every frame", () => {
    render(
      toolbar({ draw: drawOf([GROWN, table(1, []), table(2, [])]), field: nameHash("scale0") }),
    );

    expect(screen.getByText("random every frame")).toBeInTheDocument();
  });

  it("warns of a set missing a table", () => {
    render(toolbar({ draw: drawOf([GROWN], 3) }));

    expect(screen.getByText("broken")).toBeInTheDocument();
  });
});
