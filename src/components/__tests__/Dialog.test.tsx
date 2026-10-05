// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";

import { Dialog } from "../Dialog";

describe("Dialog.Shell", () => {
  it("names its close button and closes by it", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog.Shell open onClose={onClose} title="New project">
        <Dialog.Body>Body</Dialog.Body>
      </Dialog.Shell>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("offers no close button to a dialog that is mid-task", () => {
    render(
      <Dialog.Shell open onClose={() => {}} title="Importing" closable={false}>
        <Dialog.Body>Body</Dialog.Body>
      </Dialog.Shell>,
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});

describe("Dialog.Form", () => {
  it("submits from a button in the footer", async () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <Dialog.Shell open onClose={() => {}} title="New project">
        <Dialog.Form onSubmit={onSubmit}>
          <Dialog.Body>Body</Dialog.Body>
          <Dialog.Footer>
            <button type="submit">Create</button>
          </Dialog.Footer>
        </Dialog.Form>
      </Dialog.Shell>,
    );

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalled();
  });
});
