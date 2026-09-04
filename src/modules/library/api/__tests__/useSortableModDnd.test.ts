// @vitest-environment happy-dom

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockInstalledMod } from "@/test/fixtures";

const mockMutate = vi.fn();

vi.mock("../useMoveMod", () => ({
  useMoveModToFolder: () => ({ mutate: mockMutate }),
}));

import { useSortableModDnd } from "../useSortableModDnd";

function makeMods(ids: string[]) {
  return ids.map((id) => createMockInstalledMod({ id, displayName: id }));
}

function dragStart(id: string): DragStartEvent {
  return { active: { id } } as DragStartEvent;
}

function dragOver(activeId: string, overId: string): DragOverEvent {
  return { active: { id: activeId }, over: { id: overId } } as DragOverEvent;
}

function dragEnd(activeId: string, overId?: string): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId ? { id: overId } : null,
  } as DragEndEvent;
}

describe("useSortableModDnd", () => {
  const onReorder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes its order from mods", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b", "c"]), onReorder }),
    );

    expect(result.current.order).toEqual(["a", "b", "c"]);
    expect(result.current.orderedMods.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("sets activeId on drag start", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));

    expect(result.current.activeId).toBe("a");
    expect(result.current.activeMod?.id).toBe("a");
  });

  it("holds the order still and marks the gap instead", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b", "c"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragOver(dragOver("a", "c")));

    expect(result.current.order).toEqual(["a", "b", "c"]);
    expect(result.current.dropSlot).toEqual({ id: "c", side: "after" });
  });

  it("marks the near edge when dragging back up the list", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b", "c"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("c")));
    act(() => result.current.handleDragOver(dragOver("c", "a")));

    expect(result.current.dropSlot).toEqual({ id: "a", side: "before" });
  });

  it("keeps the same slot object while the pointer stays on one gap", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b", "c"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragOver(dragOver("a", "c")));
    const first = result.current.dropSlot;
    act(() => result.current.handleDragOver(dragOver("a", "c")));

    expect(result.current.dropSlot).toBe(first);
  });

  it("marks no gap over the remove-from-folder zone", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragOver(dragOver("a", "remove-from-folder")));

    expect(result.current.dropSlot).toBeNull();
  });

  it("reorders into the marked gap on drop", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b", "c"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragOver(dragOver("a", "c")));
    act(() => result.current.handleDragEnd(dragEnd("a", "c")));

    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
    expect(result.current.activeId).toBeNull();
    expect(result.current.dropSlot).toBeNull();
  });

  it("does not reorder when no gap was marked", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragEnd(dragEnd("a", "a")));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("clears the gap on drag cancel", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b", "c"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragOver(dragOver("a", "c")));

    act(() => result.current.handleDragCancel());

    expect(result.current.dropSlot).toBeNull();
    expect(result.current.activeId).toBeNull();
    expect(result.current.order).toEqual(["a", "b", "c"]);
  });

  it("calls moveModToFolder when dropped on remove zone with folderId", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b"]), onReorder, folderId: "folder-1" }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragEnd(dragEnd("a", "remove-from-folder")));

    expect(mockMutate).toHaveBeenCalledWith({ modId: "a", folderId: "root" });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not call moveModToFolder without folderId", () => {
    const { result } = renderHook(() =>
      useSortableModDnd({ mods: makeMods(["a", "b"]), onReorder }),
    );

    act(() => result.current.handleDragStart(dragStart("a")));
    act(() => result.current.handleDragEnd(dragEnd("a", "remove-from-folder")));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("follows the mods prop, mid-drag included", () => {
    const { result, rerender } = renderHook(({ mods }) => useSortableModDnd({ mods, onReorder }), {
      initialProps: { mods: makeMods(["a", "b"]) },
    });

    act(() => result.current.handleDragStart(dragStart("a")));
    rerender({ mods: makeMods(["a", "b", "c"]) });

    expect(result.current.order).toEqual(["a", "b", "c"]);
  });
});
