// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings, WadBlocklistEntry } from "@/lib/tauri";
import { createMockSettings } from "@/test/fixtures";

import { useWadBlocklist } from "../useWadBlocklist";

const { held, onSave } = vi.hoisted(() => ({
  held: { settings: null as Settings | null },
  onSave: vi.fn<(patch: Partial<Settings>) => void>(),
}));

vi.mock("../../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api")>()),
  useLoadedSettings: () => held.settings,
  useUpdateSettings: () => onSave,
}));

function setup(initial: WadBlocklistEntry[] = []) {
  held.settings = createMockSettings({ wadBlocklist: initial });
  const { result } = renderHook(() => useWadBlocklist());
  return { result, onSave };
}

describe("useWadBlocklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the current blocklist", () => {
    const initial: WadBlocklistEntry[] = [{ kind: "exact", value: "aatrox.wad.client" }];
    const { result } = setup(initial);
    expect(result.current.blocklist).toEqual(initial);
  });

  it("defaults to an empty array when wadBlocklist is unset", () => {
    held.settings = { ...createMockSettings(), wadBlocklist: undefined as unknown as never };
    const { result } = renderHook(() => useWadBlocklist());
    expect(result.current.blocklist).toEqual([]);
  });

  describe("add", () => {
    it("appends a new entry and saves the updated blocklist", () => {
      const { result, onSave } = setup();
      let added = false;
      act(() => {
        added = result.current.add({ kind: "exact", value: "aatrox.wad.client" });
      });
      expect(added).toBe(true);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0].wadBlocklist).toEqual([
        { kind: "exact", value: "aatrox.wad.client" },
      ]);
    });

    it("saves the blocklist alone, which the update merges onto the rest", () => {
      const { result, onSave } = setup();
      act(() => result.current.add({ kind: "exact", value: "x.wad.client" }));
      expect(onSave.mock.calls[0][0]).toEqual({
        wadBlocklist: [{ kind: "exact", value: "x.wad.client" }],
      });
    });

    it("rejects a same-kind duplicate (case-insensitive) without calling onSave", () => {
      const { result, onSave } = setup([{ kind: "exact", value: "Aatrox.wad.client" }]);
      let added = true;
      act(() => {
        added = result.current.add({ kind: "exact", value: "AATROX.WAD.CLIENT" });
      });
      expect(added).toBe(false);
      expect(onSave).not.toHaveBeenCalled();
    });

    it("allows the same literal value across different kinds", () => {
      const { result, onSave } = setup([{ kind: "exact", value: "scripts" }]);
      let added = false;
      act(() => {
        added = result.current.add({ kind: "regex", value: "scripts" });
      });
      expect(added).toBe(true);
      expect(onSave.mock.calls[0][0].wadBlocklist).toEqual([
        { kind: "exact", value: "scripts" },
        { kind: "regex", value: "scripts" },
      ]);
    });
  });

  describe("removeAt", () => {
    it("removes the entry at the given index", () => {
      const initial: WadBlocklistEntry[] = [
        { kind: "exact", value: "a" },
        { kind: "regex", value: "^b" },
        { kind: "exact", value: "c" },
      ];
      const { result, onSave } = setup(initial);
      act(() => result.current.removeAt(1));
      expect(onSave.mock.calls[0][0].wadBlocklist).toEqual([
        { kind: "exact", value: "a" },
        { kind: "exact", value: "c" },
      ]);
    });

    it("is a no-op when index is out of range", () => {
      const initial: WadBlocklistEntry[] = [{ kind: "exact", value: "a" }];
      const { result, onSave } = setup(initial);
      act(() => result.current.removeAt(5));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0].wadBlocklist).toEqual(initial);
    });
  });

  describe("clear", () => {
    it("saves an empty blocklist", () => {
      const { result, onSave } = setup([
        { kind: "exact", value: "a" },
        { kind: "regex", value: "b" },
      ]);
      act(() => result.current.clear());
      expect(onSave.mock.calls[0][0].wadBlocklist).toEqual([]);
    });
  });
});
