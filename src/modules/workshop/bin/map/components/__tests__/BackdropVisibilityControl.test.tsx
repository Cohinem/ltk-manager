// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { backdropFlags } from "@/test/mapBackdrop";

import { BackdropVisibilityControl } from "../BackdropVisibilityControl";

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Visibility" }));
}

afterEach(cleanup);

describe("BackdropVisibilityControl", () => {
  it("lists the layers and the controllers in a popover", async () => {
    render(<BackdropVisibilityControl backdrop={backdropFlags()} />);
    expect(screen.queryByRole("checkbox", { name: "Layer 4" })).toBeNull();

    await open();

    expect(screen.getByRole("checkbox", { name: "Layer 4" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Layer 4 0x3c5b24f7" })).toBeTruthy();
  });

  it("resets while a flag or a controller is customized", async () => {
    const held = backdropFlags({ customized: true, overrides: new Map([["0x3c5b24f7", true]]) });
    render(<BackdropVisibilityControl backdrop={held} />);
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Reset to the map's visibility" }));

    expect(held.reset).toHaveBeenCalledOnce();
  });

  it("disables the reset while nothing is customized", async () => {
    render(<BackdropVisibilityControl backdrop={backdropFlags()} />);
    await open();

    const reset = screen.getByRole("button", { name: "Reset to the map's visibility" });
    expect((reset as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no action that opens a controller object", async () => {
    render(<BackdropVisibilityControl backdrop={backdropFlags()} />);
    await open();

    expect(screen.queryByRole("button", { name: "Open the controller object" })).toBeNull();
  });
});
