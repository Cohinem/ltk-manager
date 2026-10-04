// @vitest-environment happy-dom

import { QuestionIcon } from "@phosphor-icons/react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PhysicsItem } from "../../utils/physicsItems";
import { usePicked } from "../usePicked";

function items(...paths: string[]): PhysicsItem[] {
  return paths.map((path) => ({
    path,
    icon: QuestionIcon,
    title: path,
    detail: null,
    previewed: false,
  }));
}

describe("usePicked", () => {
  it("starts unfolded on the first item", () => {
    const { result } = renderHook(() => usePicked(items("a", "b", "c")));

    expect(result.current.item?.path).toBe("a");
    expect(result.current.index).toBe(0);
    expect(result.current.listed).toBe(true);
  });

  it("folds the list when an item is opened, and not when the pick only moves", () => {
    const { result } = renderHook(() => usePicked(items("a", "b", "c")));

    act(() => result.current.pick("b"));
    expect(result.current.item?.path).toBe("b");
    expect(result.current.listed).toBe(true);

    act(() => result.current.open("c"));
    expect(result.current.item?.path).toBe("c");
    expect(result.current.listed).toBe(false);

    act(() => result.current.pick("a"));
    expect(result.current.item?.path).toBe("a");
    expect(result.current.listed).toBe(false);
  });

  it("unfolds and folds the list from its head", () => {
    const { result } = renderHook(() => usePicked(items("a", "b")));

    act(() => result.current.toggleListed());
    expect(result.current.listed).toBe(false);
    act(() => result.current.toggleListed());
    expect(result.current.listed).toBe(true);
  });

  it("opens an item added to the list", () => {
    const { result, rerender } = renderHook(({ held }) => usePicked(held), {
      initialProps: { held: items("a", "b") },
    });

    rerender({ held: items("a", "b", "c") });

    expect(result.current.item?.path).toBe("c");
    expect(result.current.listed).toBe(false);
  });

  it("keeps the place of the pick when the picked item is removed", () => {
    const { result, rerender } = renderHook(({ held }) => usePicked(held), {
      initialProps: { held: items("a", "b", "c") },
    });
    act(() => result.current.open("c"));

    rerender({ held: items("a", "b") });

    expect(result.current.item?.path).toBe("b");
    expect(result.current.listed).toBe(false);
  });

  it("keeps an empty list unfolded", () => {
    const { result, rerender } = renderHook(({ held }) => usePicked(held), {
      initialProps: { held: items("a") },
    });
    act(() => result.current.open("a"));

    rerender({ held: items() });

    expect(result.current.item).toBeNull();
    expect(result.current.index).toBe(-1);
    expect(result.current.listed).toBe(true);
  });
});
