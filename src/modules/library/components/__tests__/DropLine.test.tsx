// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DropLine } from "../DropLine";

const line = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe("DropLine", () => {
  it("seats a row line in the gutter above or below the card", () => {
    const above = render(<DropLine orientation="horizontal" side="before" visible />);
    expect(line(above.container).className).toContain("-top-1");

    const below = render(<DropLine orientation="horizontal" side="after" visible />);
    expect(line(below.container).className).toContain("-bottom-1");
  });

  it("seats a grid line in the gutter beside the card", () => {
    const left = render(<DropLine orientation="vertical" side="before" visible />);
    expect(line(left.container).className).toContain("-left-2");

    const right = render(<DropLine orientation="vertical" side="after" visible />);
    expect(line(right.container).className).toContain("-right-2");
  });

  it("caps the line at both ends, which a card's own edge never is", () => {
    const { container } = render(<DropLine orientation="horizontal" side="before" visible />);

    expect(container.querySelectorAll(".rounded-full")).toHaveLength(3);
  });

  it("collapses along its own length on the way out", () => {
    const row = render(<DropLine orientation="horizontal" side="before" visible={false} />);
    expect(line(row.container).className).toContain("scale-x-50");

    const column = render(<DropLine orientation="vertical" side="before" visible={false} />);
    expect(line(column.container).className).toContain("scale-y-50");
  });

  it("stays out of the accessibility tree", () => {
    const { container } = render(<DropLine orientation="horizontal" side="before" visible />);

    expect(line(container).getAttribute("aria-hidden")).toBe("true");
  });
});
