// @vitest-environment happy-dom

import { render, renderHook } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { expect, it, vi } from "vitest";

import type { RowReveal } from "../../state/indexBrowser";
import { useTreeReveal } from "../useTreeReveal";

const rows = ["first", "second", "third"].map((id) => ({ node: { id, type: "object" } }));
const REVEAL: RowReveal = { id: "second", token: 1 };

it("lands a reveal once across renders, and again for a newer token", () => {
  const land = vi.fn();
  const settled = vi.fn();
  const { rerender } = renderHook(({ reveal }) => useTreeReveal(rows, reveal, land, settled), {
    initialProps: { reveal: REVEAL },
  });

  rerender({ reveal: { ...REVEAL } });
  expect(land).toHaveBeenCalledTimes(1);
  expect(land).toHaveBeenCalledWith(1);
  expect(settled).toHaveBeenCalledWith(1);

  rerender({ reveal: { id: "third", token: 2 } });
  expect(land).toHaveBeenLastCalledWith(2);
  expect(settled).toHaveBeenLastCalledWith(2);
});

it("waits for a listing in flight, and settles an id no row carries without landing", () => {
  const land = vi.fn();
  const settled = vi.fn();
  const loading = [...rows, { node: { id: "l:folder", type: "loading" } }];
  const reveal: RowReveal = { id: "absent", token: 1 };
  const { rerender } = renderHook(({ held }) => useTreeReveal(held, reveal, land, settled), {
    initialProps: { held: loading },
  });

  expect(settled).not.toHaveBeenCalled();

  rerender({ held: rows });
  expect(land).not.toHaveBeenCalled();
  expect(settled).toHaveBeenCalledWith(1);
});

it("lands a reveal held at mount again after StrictMode replays the mount", () => {
  const events: string[] = [];

  function Tree() {
    /* Stands for the tree stopping its landing as it unmounts. */
    useEffect(
      () => () => {
        events.push("stopped");
      },
      [],
    );
    useTreeReveal(rows, REVEAL, (index) => events.push(`landed ${index}`));

    return null;
  }

  render(
    <StrictMode>
      <Tree />
    </StrictMode>,
  );

  expect(events).toEqual(["landed 1", "stopped", "landed 1"]);
});
