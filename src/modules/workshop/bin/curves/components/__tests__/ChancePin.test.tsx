// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { type VfxRun, VfxRunContext } from "../../../vfx/playback/state/run";
import { ChanceButton, ChancePin } from "../ChancePin";

/** A run that holds only the pin, which is all the control reads of one. */
function pinnedAt(pinned: number | null, setPinned = vi.fn()) {
  return { pinned, setPinned } as unknown as VfxRun;
}

describe("ChancePin", () => {
  it("leaves each spawn its own chance until the switch pins one", async () => {
    const setPinned = vi.fn();
    render(
      <VfxRunContext value={pinnedAt(null, setPinned)}>
        <ChancePin />
      </VfxRunContext>,
    );

    expect(screen.getByText("Each spawn draws its own")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("switch", { name: "Pin the chance" }));

    expect(setPinned).toHaveBeenCalledWith(0.5);
  });

  it("reads the pinned chance, and lets it go when the switch turns off", async () => {
    const setPinned = vi.fn();
    render(
      <VfxRunContext value={pinnedAt(0.3, setPinned)}>
        <ChancePin />
      </VfxRunContext>,
    );

    expect(screen.getByText("0.30")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("switch", { name: "Pin the chance" }));

    expect(setPinned).toHaveBeenCalledWith(null);
  });
});

describe("ChanceButton", () => {
  it("reads the pinned chance shut, and opens the pin in a popover", async () => {
    const setPinned = vi.fn();
    render(
      <VfxRunContext value={pinnedAt(0.3, setPinned)}>
        <ChanceButton />
      </VfxRunContext>,
    );

    expect(screen.getByText("0.30")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Chance" }));
    await user.click(await screen.findByRole("switch", { name: "Pin the chance" }));

    expect(setPinned).toHaveBeenCalledWith(null);
  });
});
