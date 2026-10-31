// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useResetOnChange } from "../../hooks/useResetOnChange";
import { useSkinChoice } from "../skinChoice";

describe("useSkinChoice", () => {
  it("returns to the viewport's pick when the inspector stops pointing", () => {
    const { result } = renderHook(() => useSkinChoice());

    act(() => result.current.pickSubmesh("Body"));
    act(() => result.current.setSubmesh("Cape"));
    expect(result.current.submesh).toBe("Cape");

    act(() => result.current.setSubmesh(null));
    expect(result.current.submesh).toBe("Body");

    act(() => result.current.pickSubmesh(null));
    expect(result.current.submesh).toBeNull();
  });

  it("drops the parameter when another clip is picked, and keeps it for the same clip", () => {
    const { result } = renderHook(() => useSkinChoice());

    act(() => result.current.setPicked("0x1"));
    act(() => result.current.setParameter(40));
    act(() => result.current.setPicked("0x1"));
    expect(result.current.parameter).toBe(40);

    act(() => result.current.setPicked("0x2"));
    expect(result.current.parameter).toBeNull();
  });

  it("clears the filter on a jump to a clip, and not on a jump to another map", () => {
    const { result } = renderHook(() => useSkinChoice());

    act(() => result.current.setFilter("run"));
    act(() => result.current.jumpTo("tracks", "0x1"));
    expect(result.current.filter).toBe("run");

    act(() => result.current.jumpTo("clips", "0x2"));
    expect(result.current.filter).toBe("");
  });
});

describe("useResetOnChange", () => {
  it("resets when the count changes after mount, and not at mount", () => {
    const reset = vi.fn();
    const { rerender } = renderHook(({ count }) => useResetOnChange(count, reset), {
      initialProps: { count: 3 },
    });

    expect(reset).not.toHaveBeenCalled();

    rerender({ count: 3 });
    expect(reset).not.toHaveBeenCalled();

    rerender({ count: 2 });
    expect(reset).toHaveBeenCalledOnce();
  });
});
