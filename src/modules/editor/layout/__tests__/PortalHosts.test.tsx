// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";

import { ContentVisibilityContext, useContentVisible } from "@/hooks";

import { HostedContent, PortalSlot, usePortalHosts } from "../PortalHosts";

const mounted = vi.fn();

function Body() {
  useEffect(() => mounted(), []);
  return <span data-testid="body" data-visible={String(useContentVisible())} />;
}

type Side = "left" | "right" | null;

function Frame({ side }: { side: Side }) {
  const hostOf = usePortalHosts();
  return (
    <>
      <div data-testid="left">{side === "left" && <PortalSlot host={hostOf("body")} />}</div>
      <div data-testid="right">{side === "right" && <PortalSlot host={hostOf("body")} />}</div>
      {createPortal(<Body />, hostOf("body").node)}
    </>
  );
}

function HeldFrame({ side, rightVisible = true }: { side: Side; rightVisible?: boolean }) {
  const host = usePortalHosts()("body");
  return (
    <>
      <div data-testid="left">{side === "left" && <PortalSlot host={host} />}</div>
      <ContentVisibilityContext value={rightVisible}>
        <div data-testid="right">{side === "right" && <PortalSlot host={host} />}</div>
      </ContentVisibilityContext>
      <HostedContent host={host}>
        <Body />
      </HostedContent>
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

describe("HostedContent", () => {
  it("keeps its content mounted when one slot takes over from another", () => {
    mounted.mockClear();
    const { rerender } = render(<HeldFrame side="left" />);
    expect(screen.getByTestId("left")).toContainElement(screen.getByTestId("body"));

    rerender(<HeldFrame side="right" />);

    expect(screen.getByTestId("right")).toContainElement(screen.getByTestId("body"));
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it("takes its visibility from the slot holding it", () => {
    const { rerender } = render(<HeldFrame side="right" rightVisible={false} />);
    expect(screen.getByTestId("body")).toHaveAttribute("data-visible", "false");

    rerender(<HeldFrame side="right" rightVisible />);
    expect(screen.getByTestId("body")).toHaveAttribute("data-visible", "true");
  });

  it("unmounts its content once no slot holds it", () => {
    mounted.mockClear();
    const { rerender } = render(<HeldFrame side="left" />);

    rerender(<HeldFrame side={null} />);
    expect(screen.queryByTestId("body")).not.toBeInTheDocument();

    rerender(<HeldFrame side="left" />);
    expect(mounted).toHaveBeenCalledTimes(2);
  });
});
