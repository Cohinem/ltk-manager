// @vitest-environment happy-dom

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryFolder } from "@/lib/tauri";

const mockMutate = vi.fn();

vi.mock("../useMoveMod", () => ({
  useReorderFolders: () => ({ mutate: mockMutate }),
}));

import { useFolderDnd } from "../useFolderDnd";

function makeFolders(ids: string[]): LibraryFolder[] {
  return ids.map((id) => ({ id, name: id, modIds: [] }));
}

const sortable = (id: string) => `sortable-folder:${id}`;

function dragStart(id: string): DragStartEvent {
  return { active: { id: sortable(id) } } as DragStartEvent;
}

function dragOver(activeId: string, overId: string): DragOverEvent {
  return { active: { id: sortable(activeId) }, over: { id: sortable(overId) } } as DragOverEvent;
}

function dragOverId(activeId: string, overId: string): DragOverEvent {
  return { active: { id: sortable(activeId) }, over: { id: overId } } as DragOverEvent;
}

function dragEnd(activeId: string): DragEndEvent {
  return { active: { id: sortable(activeId) }, over: null } as DragEndEvent;
}

describe("useFolderDnd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes its order from the folders", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b"]) }));

    expect(result.current.folderOrder).toEqual([sortable("a"), sortable("b")]);
  });

  it("names the dragged folder on drag start", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));

    expect(result.current.activeFolder?.id).toBe("a");
  });

  it("holds the order still and marks the gap instead", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b", "c"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    act(() => result.current.handleFolderDragOver(dragOver("a", "c")));

    expect(result.current.folderOrder).toEqual([sortable("a"), sortable("b"), sortable("c")]);
    expect(result.current.dropSlot).toEqual({ id: sortable("c"), side: "after" });
  });

  it("marks the near edge when dragging back up the row", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b", "c"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("c")));
    act(() => result.current.handleFolderDragOver(dragOver("c", "a")));

    expect(result.current.dropSlot).toEqual({ id: sortable("a"), side: "before" });
  });

  it("keeps the same slot object while the pointer stays on one gap", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b", "c"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    act(() => result.current.handleFolderDragOver(dragOver("a", "c")));
    const first = result.current.dropSlot;
    act(() => result.current.handleFolderDragOver(dragOver("a", "c")));

    expect(result.current.dropSlot).toBe(first);
  });

  it("marks no gap over anything that is not a folder", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    act(() => result.current.handleFolderDragOver(dragOver("a", "b")));
    act(() => result.current.handleFolderDragOver(dragOverId("a", "some-mod")));

    expect(result.current.dropSlot).toBeNull();
  });

  it("reorders into the marked gap on drop", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b", "c"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    act(() => result.current.handleFolderDragOver(dragOver("a", "c")));
    act(() => result.current.handleFolderDragEnd(dragEnd("a")));

    expect(mockMutate).toHaveBeenCalledWith(["b", "c", "a"]);
    expect(result.current.activeFolder).toBeNull();
    expect(result.current.dropSlot).toBeNull();
  });

  it("does not reorder when no gap was marked", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    act(() => result.current.handleFolderDragEnd(dragEnd("a")));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("clears the gap on drag cancel", () => {
    const { result } = renderHook(() => useFolderDnd({ folders: makeFolders(["a", "b", "c"]) }));

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    act(() => result.current.handleFolderDragOver(dragOver("a", "c")));
    act(() => result.current.handleFolderDragCancel());

    expect(result.current.dropSlot).toBeNull();
    expect(result.current.activeFolder).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("follows the folders prop, mid-drag included", () => {
    const { result, rerender } = renderHook(({ folders }) => useFolderDnd({ folders }), {
      initialProps: { folders: makeFolders(["a", "b"]) },
    });

    act(() => result.current.handleFolderDragStart(dragStart("a")));
    rerender({ folders: makeFolders(["a", "b", "c"]) });

    expect(result.current.folderOrder).toEqual([sortable("a"), sortable("b"), sortable("c")]);
  });
});
