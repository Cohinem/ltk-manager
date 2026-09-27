// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FlagsSelect } from "../FlagsSelect";

const HELD = { names: { disableZBuffer: 0x1, projected: 0x2, disableFow: 0x4 }, flags: true };

describe("FlagsSelect", () => {
  it("names the bits the value sets, and toggles one from the menu", async () => {
    const onChange = vi.fn();
    render(<FlagsSelect held={HELD} text="9" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /DisableZBuffer/ }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /Projected/ }));

    expect(onChange).toHaveBeenCalledWith("11");
  });

  it("reads as none where no bit is set", () => {
    render(<FlagsSelect held={HELD} text="0" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: /None/ })).toBeInTheDocument();
  });
});
