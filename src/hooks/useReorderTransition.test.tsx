// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginReorderHold, useReorderTransition } from "./useReorderTransition";

/** A grid inside a scroller, which is the shape the hook walks up to find. */
function Grid({ ids }: { ids: string[] }) {
  const ref = useReorderTransition<HTMLDivElement>();
  return (
    <div data-testid="scroller" style={{ overflowY: "auto" }}>
      <div ref={ref}>
        {ids.map((id) => (
          <div key={id} data-flip-id={id} />
        ))}
      </div>
    </div>
  );
}

describe("useReorderTransition", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  it("holds the offset when the children are reordered", () => {
    const { getByTestId, rerender } = render(<Grid ids={["a", "b", "c"]} />);
    const scroller = getByTestId("scroller");

    scroller.scrollTop = 900;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;

    rerender(<Grid ids={["c", "a", "b"]} />);

    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "instant" });
  });

  it("holds the offset taken before the reorder, not the one it lands on", () => {
    const { getByTestId, rerender } = render(<Grid ids={["a", "b", "c"]} />);
    const scroller = getByTestId("scroller");

    scroller.scrollTop = 900;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;

    beginReorderHold();
    // whatever moves the offset does it before the DOM rearranges a paint later
    scroller.scrollTop = 0;
    rerender(<Grid ids={["c", "a", "b"]} />);

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: "instant" });
  });

  it("leaves the offset alone when the children only change membership", () => {
    const { getByTestId, rerender } = render(<Grid ids={["a", "b", "c"]} />);
    const scroller = getByTestId("scroller");

    scroller.scrollTop = 900;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;

    rerender(<Grid ids={["a", "b"]} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("leaves the offset alone when nothing moved", () => {
    const { getByTestId, rerender } = render(<Grid ids={["a", "b", "c"]} />);
    const scroller = getByTestId("scroller");

    scroller.scrollTop = 900;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;

    rerender(<Grid ids={["a", "b", "c"]} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
