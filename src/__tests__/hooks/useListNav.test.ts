import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";

import { useListNav } from "@/hooks/useListNav";

/** A keyboard event with just the parts the hook reads. */
function press(key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean } = {}) {
  return {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<Element>;
}

describe("useListNav", () => {
  it("highlights the first stop", () => {
    const { result } = renderHook(() => useListNav({ indices: [1, 2, 4] }));
    expect(result.current.activeIndex).toBe(1);
  });

  it("holds no highlight while the list has no stop", () => {
    const { result } = renderHook(() => useListNav({ indices: [] }));
    expect(result.current.activeIndex).toBeNull();
  });

  it("steps over the rows that are not stops", () => {
    const { result } = renderHook(() => useListNav({ indices: [1, 2, 4] }));

    act(() => result.current.handleKeyDown(press("ArrowDown")));
    expect(result.current.activeIndex).toBe(2);

    act(() => result.current.handleKeyDown(press("ArrowDown")));
    expect(result.current.activeIndex).toBe(4);
  });

  it("wraps at either end", () => {
    const { result } = renderHook(() => useListNav({ indices: [1, 2, 4] }));

    act(() => result.current.handleKeyDown(press("ArrowUp")));
    expect(result.current.activeIndex).toBe(4);

    act(() => result.current.handleKeyDown(press("ArrowDown")));
    expect(result.current.activeIndex).toBe(1);
  });

  it("jumps to either end", () => {
    const { result } = renderHook(() => useListNav({ indices: [1, 2, 4] }));

    act(() => result.current.handleKeyDown(press("End")));
    expect(result.current.activeIndex).toBe(4);

    act(() => result.current.handleKeyDown(press("Home")));
    expect(result.current.activeIndex).toBe(1);
  });

  it("reports the highlighted stop and the modifiers held with it", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useListNav({ indices: [1, 2], onSelect }));

    act(() => result.current.handleKeyDown(press("ArrowDown")));
    act(() => result.current.handleKeyDown(press("Enter", { ctrlKey: true })));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0]![0]).toBe(2);
    expect(onSelect.mock.calls[0]![1].ctrlKey).toBe(true);
  });

  it("reports nothing on enter while the list is empty", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useListNav({ indices: [], onSelect }));

    act(() => result.current.handleKeyDown(press("Enter")));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cancels on escape", () => {
    const onCancel = vi.fn();
    const { result } = renderHook(() => useListNav({ indices: [1], onCancel }));

    act(() => result.current.handleKeyDown(press("Escape")));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("returns the highlight to the top when the list changes", () => {
    const { result, rerender } = renderHook(({ indices }) => useListNav({ indices }), {
      initialProps: { indices: [1, 2, 4] },
    });

    act(() => result.current.handleKeyDown(press("End")));
    expect(result.current.activeIndex).toBe(4);

    rerender({ indices: [3, 5] });
    expect(result.current.activeIndex).toBe(3);
  });

  it("holds the highlight across a render that leaves the list alone", () => {
    const indices = [1, 2, 4];
    const { result, rerender } = renderHook(() => useListNav({ indices }));

    act(() => result.current.handleKeyDown(press("End")));
    rerender();

    expect(result.current.activeIndex).toBe(4);
  });
});
