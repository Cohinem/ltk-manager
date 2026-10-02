// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { holderRow } from "../../utils/holderRow";
import { Line } from "../FieldLines";
import { RowMenuContext } from "../graphActions";

describe("a node's field line", () => {
  it("reports its row to the Graph pane's menu on a right click", () => {
    const report = vi.fn();
    const row = holderRow("0x1", "0xabcd");
    render(
      <RowMenuContext value={report}>
        <Line menu={{ row, owner: "0x2" }}>
          <span>rate</span>
        </Line>
      </RowMenuContext>,
    );

    fireEvent.contextMenu(screen.getByText("rate"));

    expect(report).toHaveBeenCalledWith({ row, owner: "0x2", curve: false });
  });

  it("reports nothing for a line that draws no row", () => {
    const report = vi.fn();
    render(
      <RowMenuContext value={report}>
        <Line>
          <span>Emission</span>
        </Line>
      </RowMenuContext>,
    );

    fireEvent.contextMenu(screen.getByText("Emission"));

    expect(report).not.toHaveBeenCalled();
  });
});
