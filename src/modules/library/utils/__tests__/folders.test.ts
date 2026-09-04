import { describe, expect, it } from "vitest";

import { createMockInstalledMod } from "@/test/fixtures";

import {
  formatToggleMessage,
  getFolderEnabledState,
  getFolderSummary,
  promoteToFolderFront,
} from "../folders";

describe("getFolderEnabledState", () => {
  it("returns all false for empty mods", () => {
    const result = getFolderEnabledState([]);
    expect(result).toEqual({ enabledCount: 0, checked: false, indeterminate: false });
  });

  it("returns checked when all mods enabled", () => {
    const mods = [
      createMockInstalledMod({ id: "a", enabled: true }),
      createMockInstalledMod({ id: "b", enabled: true }),
    ];
    const result = getFolderEnabledState(mods);
    expect(result).toEqual({ enabledCount: 2, checked: true, indeterminate: false });
  });

  it("returns unchecked when all mods disabled", () => {
    const mods = [
      createMockInstalledMod({ id: "a", enabled: false }),
      createMockInstalledMod({ id: "b", enabled: false }),
    ];
    const result = getFolderEnabledState(mods);
    expect(result).toEqual({ enabledCount: 0, checked: false, indeterminate: false });
  });

  it("returns indeterminate when mods are mixed", () => {
    const mods = [
      createMockInstalledMod({ id: "a", enabled: true }),
      createMockInstalledMod({ id: "b", enabled: false }),
      createMockInstalledMod({ id: "c", enabled: true }),
    ];
    const result = getFolderEnabledState(mods);
    expect(result).toEqual({ enabledCount: 2, checked: false, indeterminate: true });
  });

  it("returns checked for a single enabled mod", () => {
    const mods = [createMockInstalledMod({ id: "a", enabled: true })];
    const result = getFolderEnabledState(mods);
    expect(result).toEqual({ enabledCount: 1, checked: true, indeterminate: false });
  });

  it("returns unchecked for a single disabled mod", () => {
    const mods = [createMockInstalledMod({ id: "a", enabled: false })];
    const result = getFolderEnabledState(mods);
    expect(result).toEqual({ enabledCount: 0, checked: false, indeterminate: false });
  });
});

describe("getFolderSummary", () => {
  it("returns empty string for empty mods", () => {
    expect(getFolderSummary([])).toBe("");
  });

  it("returns empty string for mods with no tags or champions", () => {
    const mods = [createMockInstalledMod({ id: "a", tags: [], champions: [] })];
    expect(getFolderSummary(mods)).toBe("");
  });

  it("returns champion count", () => {
    const mods = [
      createMockInstalledMod({ id: "a", champions: ["Lux", "Ahri"] }),
      createMockInstalledMod({ id: "b", champions: ["Lux", "Jinx"] }),
    ];
    expect(getFolderSummary(mods)).toBe("3 champs");
  });

  it("returns tag count", () => {
    const mods = [
      createMockInstalledMod({ id: "a", tags: ["skin", "hud"] }),
      createMockInstalledMod({ id: "b", tags: ["skin"] }),
    ];
    expect(getFolderSummary(mods)).toBe("2 tags");
  });

  it("returns both champions and tags", () => {
    const mods = [createMockInstalledMod({ id: "a", champions: ["Lux"], tags: ["skin"] })];
    expect(getFolderSummary(mods)).toBe("1 champ · 1 tag");
  });

  it("deduplicates across mods", () => {
    const mods = [
      createMockInstalledMod({ id: "a", champions: ["Lux"], tags: ["skin", "hud"] }),
      createMockInstalledMod({ id: "b", champions: ["Lux"], tags: ["skin", "map"] }),
    ];
    expect(getFolderSummary(mods)).toBe("1 champ · 3 tags");
  });
});

describe("formatToggleMessage", () => {
  it("formats enabled message with plural mods", () => {
    const msg = formatToggleMessage(true, 5, "Ranked Skins");
    expect(msg.title).toBe("Enabled 5 mods");
    expect(msg.description).toBe('All mods in "Ranked Skins" have been enabled');
  });

  it("formats disabled message with plural mods", () => {
    const msg = formatToggleMessage(false, 3, "ARAM Fun");
    expect(msg.title).toBe("Disabled 3 mods");
    expect(msg.description).toBe('All mods in "ARAM Fun" have been disabled');
  });

  it("formats singular mod correctly", () => {
    const msg = formatToggleMessage(true, 1, "Solo");
    expect(msg.title).toBe("Enabled 1 mod");
  });

  it("formats zero mods correctly", () => {
    const msg = formatToggleMessage(false, 0, "Empty");
    expect(msg.title).toBe("Disabled 0 mods");
  });
});

describe("promoteToFolderFront", () => {
  const ids = (mods: { id: string }[]) => mods.map((mod) => mod.id);

  it("moves a root mod to the top of the root run", () => {
    const mods = [
      createMockInstalledMod({ id: "a", folderId: null }),
      createMockInstalledMod({ id: "b", folderId: null }),
      createMockInstalledMod({ id: "c", folderId: null }),
    ];
    expect(ids(promoteToFolderFront(mods, "c"))).toEqual(["c", "a", "b"]);
  });

  it("moves a foldered mod to the top of its own folder only", () => {
    const mods = [
      createMockInstalledMod({ id: "a", folderId: null }),
      createMockInstalledMod({ id: "b", folderId: "f1" }),
      createMockInstalledMod({ id: "c", folderId: "f1" }),
    ];
    expect(ids(promoteToFolderFront(mods, "c"))).toEqual(["a", "c", "b"]);
  });

  it("leaves a mod that already leads its folder", () => {
    const mods = [
      createMockInstalledMod({ id: "a", folderId: null }),
      createMockInstalledMod({ id: "b", folderId: null }),
    ];
    expect(promoteToFolderFront(mods, "a")).toBe(mods);
  });

  it("leaves a list that does not hold the mod", () => {
    const mods = [createMockInstalledMod({ id: "a", folderId: null })];
    expect(promoteToFolderFront(mods, "gone")).toBe(mods);
  });
});
