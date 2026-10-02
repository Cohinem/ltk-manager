// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Fill, Grid, Inline, space, Stack } from "../Layout";

afterEach(cleanup);

describe("layout primitives", () => {
  it("resolves whole steps to the space tokens and half steps onto the same scale", () => {
    expect(space(0)).toBe("0px");
    expect(space(2)).toBe("var(--space-002)");
    expect(space(12)).toBe("var(--space-012)");
    expect(space(1.5)).toBe("calc(1.5 * var(--space-001))");
  });

  it("renders a stack as the requested element with its gap and alignment", () => {
    render(
      <Stack as="section" gap={3} align="center" data-ui="Probe" aria-label="probe">
        <span>child</span>
      </Stack>,
    );

    const stack = screen.getByRole("region", { name: "probe" });
    expect(stack.tagName).toBe("SECTION");
    expect(stack).toHaveAttribute("data-layout", "stack");
    expect(stack).toHaveAttribute("data-ui", "Probe");
    expect(stack.style.getPropertyValue("--layout-gap")).toBe("var(--space-003)");
    expect(stack.style.getPropertyValue("--layout-align")).toBe("center");
    expect(stack.style.getPropertyValue("--layout-justify")).toBe("flex-start");
  });

  it("sets every property an inline reads, so a nested one inherits nothing", () => {
    render(<Inline gap={2} data-testid="row" />);

    const row = screen.getByTestId("row");
    expect(row.style.getPropertyValue("--layout-gap")).toBe("var(--space-002)");
    expect(row.style.getPropertyValue("--layout-row-gap")).toBe("var(--space-002)");
    expect(row.style.getPropertyValue("--layout-align")).toBe("center");
    expect(row.style.getPropertyValue("--layout-wrap")).toBe("nowrap");
  });

  it("builds the column template from a count, a template or a minimum width", () => {
    render(
      <>
        <Grid columns={3} data-testid="count" />
        <Grid columns="max-content minmax(0, 1fr)" data-testid="template" />
        <Grid minColumnWidth="14rem" collapseBelow="lg" data-testid="fit" />
      </>,
    );

    expect(screen.getByTestId("count").style.getPropertyValue("--layout-columns")).toBe(
      "repeat(3, minmax(0, 1fr))",
    );
    expect(screen.getByTestId("template").style.getPropertyValue("--layout-columns")).toBe(
      "max-content minmax(0, 1fr)",
    );

    const fit = screen.getByTestId("fit");
    expect(fit.style.getPropertyValue("--layout-columns")).toBe(
      "repeat(auto-fill, minmax(min(14rem, 100%), 1fr))",
    );
    expect(fit).toHaveAttribute("data-layout-collapse", "lg");
  });

  it("marks a filling element and leaves the others unmarked", () => {
    render(
      <>
        <Fill data-testid="fill" />
        <Stack fill data-testid="stack-fill" />
        <Stack data-testid="stack" />
      </>,
    );

    expect(screen.getByTestId("fill")).toHaveAttribute("data-layout-fill");
    expect(screen.getByTestId("stack-fill")).toHaveAttribute("data-layout-fill");
    expect(screen.getByTestId("stack")).not.toHaveAttribute("data-layout-fill");
  });
});
