// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";

import { PortalSlot, usePortalHosts } from "../PortalHosts";

const mounted = vi.fn();

function Body() {
  useEffect(() => mounted(), []);
  return <span data-testid="body" />;
}

function Frame({ side }: { side: "left" | "right" | null }) {
  const hostOf = usePortalHosts();
  return (
    <>
      <div data-testid="left">{side === "left" && <PortalSlot host={hostOf("body")} />}</div>
      <div data-testid="right">{side === "right" && <PortalSlot host={hostOf("body")} />}</div>
      {createPortal(<Body />, hostOf("body"))}
    </>
  );
}

describe("usePortalHosts", () => {
  it("moves a body between slots without remounting it", () => {
    mounted.mockClear();
    const { rerender } = render(<Frame side="left" />);
    expect(screen.getByTestId("left")).toContainElement(screen.getByTestId("body"));

    rerender(<Frame side="right" />);

    expect(screen.getByTestId("right")).toContainElement(screen.getByTestId("body"));
    expect(screen.getByTestId("left")).toBeEmptyDOMElement();
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it("keeps a body mounted while no slot shows it", () => {
    mounted.mockClear();
    const { rerender } = render(<Frame side="left" />);

    rerender(<Frame side={null} />);
    expect(screen.queryByTestId("body")).not.toBeInTheDocument();

    rerender(<Frame side="left" />);
    expect(screen.getByTestId("left")).toContainElement(screen.getByTestId("body"));
    expect(mounted).toHaveBeenCalledTimes(1);
  });
});
