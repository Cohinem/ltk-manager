// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AlertBox } from "../AlertBox";

describe("AlertBox", () => {
  it("interrupts for a warning or an error, and waits its turn for the other tones", () => {
    render(
      <>
        <AlertBox tone="danger" title="The build failed" />
        <AlertBox tone="warning" title="Two mods edit one file" />
        <AlertBox tone="info" title="A new build is ready" />
        <AlertBox tone="success" title="The overlay is up to date" />
        <AlertBox tone="neutral" title="Nothing is enabled" />
      </>,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  it("closes through a named dismiss button", async () => {
    const onDismiss = vi.fn();
    render(<AlertBox title="A new build is ready" onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("is one button when it is pressable, and does not answer while disabled", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<AlertBox tone="danger" title="3 problems" onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "3 problems" }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<AlertBox tone="danger" title="3 problems" onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole("button", { name: "3 problems" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
