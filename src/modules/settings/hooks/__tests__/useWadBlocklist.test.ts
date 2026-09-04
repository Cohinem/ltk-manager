// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings, WadBlocklistEntry } from "@/lib/tauri";
import { createMockSettings } from "@/test/fixtures";

import { useWadBlocklist } from "../useWadBlocklist";

function setup(initial: WadBlocklistEntry[] = []) {
  const onSave = vi.fn<(s: Settings) => void>();
  const settings = createMockSettings({ wadBlocklist: initial });
  const { result, rerender } = renderHook(({ s }: { s: Settings }) => useWadBlocklist(s, onSave), {
    initialProps: { s: settings },
  });
  return { result, rerender, onSave, settings };
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
    const onSave = vi.fn();
    const settings = { ...createMockSettings(), wadBlocklist: undefined as unknown as never };
    const { result } = renderHook(() => useWadBlocklist(settings, onSave));
    expect(result.current.blocklist).toEqual([]);
  });

  describe("add", () => {
    it("appends a new entry and calls onSave with the updated settings", () => {
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

    it("preserves other settings fields when saving", () => {
      const { result, onSave } = setup();
      act(() => result.current.add({ kind: "exact", value: "x.wad.client" }));
      const saved = onSave.mock.calls[0][0];
      expect(saved.leaguePath).toBe(null);
      expect(saved.blockScriptsWad).toBe(true);
      expect(saved.trustedDomains).toEqual(["runeforge.dev", "divineskins.gg"]);
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
