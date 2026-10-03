import { describe, expect, it } from "vitest";

import type { LibraryFolder } from "@/lib/tauri";
import { championRoster } from "@/modules/champions";
import { createMockInstalledMod } from "@/test/fixtures";

import type { TableGroupBy } from "../../../state";
import { buildTableRows, type GroupingContext, orderedModIds } from "../rows";

const context: GroupingContext = {
  roster: championRoster([]),
  effective: new Map(),
  verdicts: undefined,
  now: new Date("2026-10-02T12:00:00Z"),
};

const folder = { id: "maps", name: "Map skins" } as LibraryFolder;

const halloween = createMockInstalledMod({
  id: "halloween",
  displayName: "Classic Rift - Halloween",
  tags: ["map-skin", "ward"],
  folderId: "maps",
  enabled: false,
});
const braum = createMockInstalledMod({
  id: "braum",
  displayName: "Pig-at-arms Braum",
  champions: ["Braum"],
  tags: [],
  enabled: true,
});
const hud = createMockInstalledMod({
  id: "hud",
  displayName: "Comic Sans HUD",
  tags: ["font"],
  enabled: true,
});

function build(groupBy: TableGroupBy, extra: Partial<Parameters<typeof buildTableRows>[0]> = {}) {
  return buildTableRows({
    mods: [halloween, braum, hud],
    groupBy,
    folders: [folder],
    expandedFolders: new Set(["maps"]),
    collapsedGroups: new Set(),
    narrowed: false,
    context,
    ...extra,
  });
}

function shape(rows: ReturnType<typeof build>) {
  return rows.map((row) => (row.type === "group" ? `# ${row.label}` : row.mod.id));
}

describe("buildTableRows", () => {
  it("draws one flat row per mod without a grouping", () => {
    expect(shape(build("none"))).toEqual(["halloween", "braum", "hud"]);
  });

  it("puts folders first and the mods outside any folder after them, unheaded", () => {
    expect(shape(build("folder"))).toEqual(["# Map skins", "halloween", "braum", "hud"]);
  });

  it("keeps a collapsed folder's heading and hides its mods", () => {
    expect(shape(build("folder", { expandedFolders: new Set() }))).toEqual([
      "# Map skins",
      "braum",
      "hud",
    ]);
  });

  it("files a mod under each of its tags and puts the empty group last", () => {
    const rows = build("tag");
    const groups = rows.filter((row) => row.type === "group").map((row) => row.mods.length);

    expect(groups).toHaveLength(4);
    expect(shape(rows).at(-2)).toBe("# No tag");
    expect(rows.filter((row) => row.type === "mod" && row.mod.id === "halloween")).toHaveLength(2);
  });

  it("gives each copy of a mod its own row key", () => {
    const keys = build("tag").map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("orders on or off groups with the enabled mods first", () => {
    expect(shape(build("enabled"))).toEqual(["# On", "braum", "hud", "# Off", "halloween"]);
  });

  it("opens a collapsed group while a search or a filter stands", () => {
    const collapsedGroups = new Set(["enabled:off"]);

    expect(shape(build("enabled", { collapsedGroups }))).not.toContain("halloween");
    expect(shape(build("enabled", { collapsedGroups, narrowed: true }))).toContain("halloween");
  });

  it("lists each mod once for ranges, however many groups hold it", () => {
    expect(orderedModIds(build("tag"))).toHaveLength(3);
  });
});
