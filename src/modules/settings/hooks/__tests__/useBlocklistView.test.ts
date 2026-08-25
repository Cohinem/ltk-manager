// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WadBlocklistEntry } from "@/lib/tauri";

import { type BlocklistSortKey, useBlocklistView } from "../useBlocklistView";

function view(blocklist: WadBlocklistEntry[], search: string, sortKey: BlocklistSortKey) {
  const { result } = renderHook(() => useBlocklistView(blocklist, search, sortKey));
  return result.current;
}

describe("useBlocklistView", () => {
  const entries: WadBlocklistEntry[] = [
    { kind: "exact", value: "Zed.wad.client" },
    { kind: "regex", value: "^map\\d+" },
    { kind: "exact", value: "Aatrox.wad.client" },
    { kind: "exact", value: "Map22.wad.client" },
  ];

  describe("filtering", () => {
    it("returns everything when search is empty", () => {
      const result = view(entries, "", "nameAsc");
      expect(result).toHaveLength(entries.length);
    });

    it("trims the search term", () => {
      const result = view(entries, "   aatrox   ", "nameAsc");
      expect(result.map((d) => d.entry.value)).toEqual(["Aatrox.wad.client"]);
    });

    it("matches as a case-insensitive substring", () => {
      const result = view(entries, "MAP", "nameAsc");
      expect(result.map((d) => d.entry.value).sort()).toEqual(
        ["Map22.wad.client", "^map\\d+"].sort(),
      );
    });

    it("returns an empty list when nothing matches", () => {
      expect(view(entries, "nope", "nameAsc")).toEqual([]);
    });
  });

  describe("sorting", () => {
    it("sorts by name ascending", () => {
      const result = view(entries, "", "nameAsc");
      expect(result.map((d) => d.entry.value)).toEqual([
        "^map\\d+",
        "Aatrox.wad.client",
        "Map22.wad.client",
        "Zed.wad.client",
      ]);
    });

    it("sorts by name descending", () => {
      const result = view(entries, "", "nameDesc");
      expect(result.map((d) => d.entry.value)).toEqual([
        "Zed.wad.client",
        "Map22.wad.client",
        "Aatrox.wad.client",
        "^map\\d+",
      ]);
    });

    it("sorts by kind (exact before regex, then by name within each group)", () => {
      const result = view(entries, "", "kind");
      expect(result.map((d) => d.entry.kind)).toEqual(["exact", "exact", "exact", "regex"]);
      const exactNames = result.slice(0, 3).map((d) => d.entry.value);
      expect(exactNames).toEqual([...exactNames].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe("originalIndex", () => {
    it("preserves indices into the source blocklist", () => {
      const result = view(entries, "", "nameAsc");
      for (const decorated of result) {
        expect(entries[decorated.originalIndex]).toBe(decorated.entry);
      }
    });

    it("preserves indices through filtering", () => {
      const result = view(entries, "aatrox", "nameAsc");
      expect(result).toHaveLength(1);
      expect(result[0].originalIndex).toBe(2);
      expect(entries[result[0].originalIndex]).toBe(result[0].entry);
    });
  });

  it("does not mutate the input array", () => {
    const input: WadBlocklistEntry[] = [
      { kind: "exact", value: "c" },
      { kind: "exact", value: "a" },
      { kind: "exact", value: "b" },
    ];
    const snapshot = input.map((e) => e.value);
    view(input, "", "nameAsc");
    expect(input.map((e) => e.value)).toEqual(snapshot);
  });

  it("returns an empty list for an empty blocklist", () => {
    expect(view([], "", "nameAsc")).toEqual([]);
  });
});
