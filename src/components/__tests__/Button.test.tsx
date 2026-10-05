// @vitest-environment happy-dom

import { GearIcon } from "@phosphor-icons/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button, IconButton } from "../Button";

describe("Button", () => {
  it("keeps its label laid out while loading, and cannot be pressed", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Saving")).toHaveClass("invisible");

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("leaves the tab order when disabled without a reason", async () => {
    render(<Button disabled>Start</Button>);

    await userEvent.tab();

    expect(screen.getByRole("button", { name: "Start" })).not.toHaveFocus();
  });

  it("stays focusable and says why when disabled with a reason", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled disabledReason="Enable a mod first." onClick={onClick}>
        Start
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Start" });
    await userEvent.tab();

    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(await screen.findByText("Enable a mod first.")).toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("names itself by its label", () => {
    render(<IconButton icon={<GearIcon />} label="Settings" />);

    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("shows the reason in place of its label while disabled", async () => {
    render(
      <IconButton icon={<GearIcon />} label="Settings" disabled disabledReason="Locked for now." />,
    );

    await userEvent.tab();

    expect(await screen.findByText("Locked for now.")).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });
});
