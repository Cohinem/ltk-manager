// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ENTRIES } from "../../entries";
import { Gallery } from "../Gallery";

describe("Gallery", () => {
  it("draws every entry without a case throwing", () => {
    render(<Gallery />);

    expect(ENTRIES.length).toBeGreaterThan(0);
    for (const entry of ENTRIES) {
      expect(screen.getByRole("heading", { name: entry.name })).toBeInTheDocument();
    }
    expect(screen.queryByText("This case threw while rendering")).not.toBeInTheDocument();
  });

  it("forces a condition on the root and puts the app's value back on the way out", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { unmount } = render(<Gallery />);

    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    unmount();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("narrows the entries to the ones the search names", async () => {
    render(<Gallery />);

    await userEvent.type(screen.getByRole("textbox", { name: "Find a component" }), "switch");

    expect(screen.getByRole("heading", { name: "Switch" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Button" })).not.toBeInTheDocument();
  });
});
