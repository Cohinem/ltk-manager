// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ChromeGround,
  ChromePortal,
  ChromeSlot,
  useChromeGrounded,
  useChromeSlotFilled,
} from "../ChromeSlot";

function Filled() {
  const state = useChromeSlotFilled("status") ? "filled" : "empty";

  return <output>{state}</output>;
}

function Grounded() {
  const state = useChromeGrounded() ? "grounded" : "raised";

  return <output>{state}</output>;
}

describe("ChromeSlot", () => {
  it("draws a page's children in the frame's slot, whichever of the two mounts first", () => {
    render(
      <>
        <main>
          <ChromePortal slot="title">
            <button type="button">Search</button>
          </ChromePortal>
        </main>
        <header data-testid="frame">
          <ChromeSlot name="title" />
        </header>
      </>,
    );

    expect(screen.getByTestId("frame")).toContainElement(
      screen.getByRole("button", { name: "Search" }),
    );
  });

  it("draws nothing while the frame offers no slot", () => {
    render(
      <ChromePortal slot="title">
        <button type="button">Search</button>
      </ChromePortal>,
    );

    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
  });

  it("reports a slot filled while a page draws into it, and empty once the page leaves", () => {
    const { rerender } = render(
      <>
        <Filled />
        <ChromePortal slot="status">
          <button type="button">Pack</button>
        </ChromePortal>
      </>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("filled");

    rerender(<Filled />);

    expect(screen.getByRole("status")).toHaveTextContent("empty");
  });

  it("reports the frame grounded while a page asks for its ground, and raised once it leaves", () => {
    const { rerender } = render(
      <>
        <Grounded />
        <ChromeGround />
      </>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("grounded");

    rerender(<Grounded />);

    expect(screen.getByRole("status")).toHaveTextContent("raised");
  });
});
