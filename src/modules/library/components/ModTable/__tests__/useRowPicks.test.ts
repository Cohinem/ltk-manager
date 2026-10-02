// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useRowPicks } from "@/components";
import { createMockInstalledMod } from "@/test/fixtures";

import { useLibrarySelectionStore } from "../../../state";
import type { TableRow } from "../rows";

const mod = (id: string) => createMockInstalledMod({ id, displayName: id });

/* Tagged rows: "b" is filed under both tags, so it is drawn twice. */
const rows: TableRow[] = [
  { type: "group", key: "tag:x", label: "x", mods: [], expanded: true, value: "x" },
  { type: "mod", key: "tag:x|a", mod: mod("a") },
  { type: "mod", key: "tag:x|b", mod: mod("b") },
  { type: "group", key: "tag:y", label: "y", mods: [], expanded: true, value: "y" },
  { type: "mod", key: "tag:y|c", mod: mod("c") },
  { type: "mod", key: "tag:y|b", mod: mod("b") },
  { type: "mod", key: "tag:y|d", mod: mod("d") },
];

const modOf = (row: TableRow) => (row.type === "mod" ? row.mod.id : null);
const selection = () => useLibrarySelectionStore.getState();
const picked = () => [...useLibrarySelectionStore.getState().selectedIds].sort();

beforeEach(() => {
  useLibrarySelectionStore.setState({
    selectedIds: new Set(),
    orderedIds: ["a", "b", "c", "d"],
    anchorId: null,
    rangeBase: null,
  });
});

describe("useRowPicks", () => {
  it("ranges from the row that was pressed, not the mod's first copy", () => {
    const { result } = renderHook(() => useRowPicks(rows, modOf, selection));

    act(() => result.current.anchor("tag:y|b", "b"));
    act(() => result.current.rangeTo("tag:y|d", "d"));

    expect(picked()).toEqual(["b", "d"]);
  });

  it("ranges across a group heading", () => {
    const { result } = renderHook(() => useRowPicks(rows, modOf, selection));

    act(() => result.current.pick("tag:x|a", "a"));
    act(() => result.current.rangeTo("tag:y|c", "c"));

    expect(picked()).toEqual(["a", "b", "c"]);
  });

  it("picks the rows a fast drag skipped over", () => {
    const { result } = renderHook(() => useRowPicks(rows, modOf, selection));
    const press = { button: 0, shiftKey: false, preventDefault: () => {} } as React.PointerEvent;

    act(() => result.current.startPick(press, "tag:x|a", "a", false));
    act(() => void result.current.paintOver("tag:y|c", 1));

    expect(picked()).toEqual(["a", "b", "c"]);
  });

  it("ends a drag whose release was never seen", () => {
    const { result } = renderHook(() => useRowPicks(rows, modOf, selection));
    const press = { button: 0, shiftKey: false, preventDefault: () => {} } as React.PointerEvent;

    act(() => result.current.startPick(press, "tag:x|a", "a", false));

    expect(result.current.paintOver("tag:y|c", 0)).toBe(false);
    expect(result.current.paintOver("tag:y|d", 1)).toBe(false);
    expect(picked()).toEqual(["a"]);
  });

  it("picks only the pressed row while nothing anchors a range", () => {
    const { result } = renderHook(() => useRowPicks(rows, modOf, selection));

    act(() => result.current.rangeTo("tag:y|c", "c"));

    expect(picked()).toEqual(["c"]);
  });
});
