// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { HandleKind } from "../../utils/spatialHandles";
import { HandleMenu } from "../HandleMenu";

const ADDS_HINT = "+ adds the property";

async function open(
  blocked: (kind: HandleKind) => string | null,
  adds: (kind: HandleKind) => boolean,
) {
  const onChange = vi.fn();
  render(<HandleMenu value={null} blocked={blocked} adds={adds} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: "Viewport handle" }));
  return onChange;
}

describe("HandleMenu", () => {
  it("offers a handle whose property the file lacks, and says once what choosing it adds", async () => {
    const onChange = await open(
      () => null,
      (kind) => kind === "offset" || kind === "turn",
    );

    expect(screen.getAllByText(ADDS_HINT)).toHaveLength(1);
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Offset" }));

    expect(onChange).toHaveBeenCalledWith("offset");
  });

  it("says nothing of adding where every handle's property is in the file", async () => {
    await open(
      () => null,
      () => false,
    );

    expect(screen.queryByText(ADDS_HINT)).toBeNull();
  });

  it("lists a handle the emitter cannot take disabled, under its reason", async () => {
    await open(
      (kind) => (kind === "size" ? "Not on this shape" : null),
      () => false,
    );

    const size = await screen.findByRole("menuitemradio", { name: /Shape size/ });

    expect(size).toHaveAttribute("aria-disabled", "true");
    expect(size).toHaveTextContent("Not on this shape");
  });
});
