// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InputDefaultContext } from "../InputDefaultContext";
import { Readout } from "../Readout";
import { stepNumber } from "../stepNumber";

afterEach(cleanup);

describe("numeric readouts", () => {
  it("steps a vector component with fine and coarse modifiers and commits once", () => {
    const commit = vi.fn();
    render(<Readout value="1" label="x" step={1} onCommit={commit} />);
    const input = screen.getByRole("textbox", { name: "x" });
    input.focus();

    fireEvent.keyDown(input, { key: "ArrowUp", ctrlKey: true });
    expect(input).toHaveValue("1.1");
    fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
    expect(input).toHaveValue("-8.9");
    expect(commit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).toHaveBeenCalledExactlyOnceWith("-8.9");
  });

  it("cancels a stepped draft with Escape", () => {
    const commit = vi.fn();
    render(<Readout value="2" label="y" step={1} onCommit={commit} />);
    const input = screen.getByRole("textbox", { name: "y" });
    input.focus();
    fireEvent.click(screen.getAllByRole("button", { name: "Increase value" }).at(-1)!);
    expect(input).toHaveValue("3");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("2");
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not step read-only values", () => {
    render(<Readout value="9" label="z" step={1} />);
    const input = screen.getByRole("textbox", { name: "z" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("9");
  });

  it("keeps 64-bit integer steps exact", () => {
    expect(stepNumber("18446744073709551614", "integer", 1, true, false)).toBe(
      "18446744073709551615",
    );
    expect(stepNumber("-9223372036854775808", "integer", 1, false, true)).toBe(
      "-9223372036854775798",
    );
  });

  it("rejects malformed and non-finite drafts", () => {
    for (const text of ["", "NaN", "Infinity", "broken"]) {
      expect(stepNumber(text, 1, 1, false, false)).toBeNull();
    }

    expect(stepNumber("1.5", "integer", 1, false, false)).toBeNull();
    expect(stepNumber("0.2", 0.1, 1, false, false)).toBe("0.3");
  });
});

describe("implicit readouts", () => {
  it("shows the default as a placeholder without authoring it on focus or blur", () => {
    const commit = vi.fn();
    render(
      <InputDefaultContext value>
        <Readout value="12" onCommit={commit} />
      </InputDefaultContext>,
    );
    const input = screen.getByPlaceholderText("12");
    expect(input).toHaveValue("");
    expect(input).toHaveClass("bg-transparent");

    input.focus();
    input.blur();
    expect(commit).not.toHaveBeenCalled();
  });

  it("steps from the default and restores its placeholder on Escape", () => {
    const commit = vi.fn();
    render(
      <InputDefaultContext value>
        <Readout value="12" step={1} onCommit={commit} />
      </InputDefaultContext>,
    );
    const input = screen.getByPlaceholderText("12");
    fireEvent.click(screen.getByRole("button", { name: "Increase value" }));
    expect(input).toHaveValue("13");
    expect(input).not.toHaveClass("bg-transparent");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(input).toHaveClass("bg-transparent");
    expect(commit).not.toHaveBeenCalled();

    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown", ctrlKey: true });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).toHaveBeenCalledExactlyOnceWith("11.9");
  });

  it("allows an explicit value equal to the default", () => {
    const commit = vi.fn();
    const view = render(
      <InputDefaultContext value>
        <Readout value="12" onCommit={commit} />
      </InputDefaultContext>,
    );
    const input = screen.getByPlaceholderText("12");
    input.focus();
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).toHaveBeenCalledExactlyOnceWith("12");

    view.rerender(
      <InputDefaultContext value={false}>
        <Readout value="12" onCommit={commit} />
      </InputDefaultContext>,
    );
    expect(input).toHaveValue("12");
    expect(input).not.toHaveAttribute("placeholder");

    view.rerender(
      <InputDefaultContext value>
        <Readout value="12" onCommit={commit} />
      </InputDefaultContext>,
    );
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "12");
  });
});
