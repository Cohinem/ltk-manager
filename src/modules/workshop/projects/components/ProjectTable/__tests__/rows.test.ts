import { describe, expect, it } from "vitest";

import type { WorkshopProject } from "@/lib/tauri";
import { championRoster } from "@/modules/champions";

import { buildProjectRows, orderedProjectPaths } from "../rows";

function project(name: string, over: Partial<WorkshopProject> = {}): WorkshopProject {
  return {
    path: `X:/mods/${name}`,
    name,
    displayName: name,
    version: "1.0.0",
    description: "",
    authors: [],
    tags: [],
    champions: [],
    maps: [],
    layers: [],
    thumbnailPath: null,
    lastModified: "2026-08-21T21:14:02Z",
    location: "workshop",
    lastOpened: null,
    id: name,
    ...over,
  };
}

const roster = championRoster([]);
const keys = (rows: ReturnType<typeof buildProjectRows>) => rows.map((row) => row.key);

describe("buildProjectRows", () => {
  const projects = [
    project("a", { tags: ["skin"], location: "opened" }),
    project("b", { tags: ["skin", "map"] }),
    project("c"),
  ];

  it("files a project under every tag it carries, and an untagged one last", () => {
    const rows = buildProjectRows({
      projects,
      groupBy: "tag",
      collapsedGroups: new Set(),
      narrowed: false,
      roster,
    });

    const headings = rows.filter((row) => row.type === "group");
    expect(headings.at(-1)?.value).toBeNull();
    expect(rows.filter((row) => row.type === "project" && row.project.name === "b")).toHaveLength(
      2,
    );
    expect(orderedProjectPaths(rows)).toHaveLength(3);
  });

  it("puts the workshop folder before the opened folders", () => {
    const rows = buildProjectRows({
      projects,
      groupBy: "location",
      collapsedGroups: new Set(),
      narrowed: false,
      roster,
    });

    expect(keys(rows).filter((key) => !key.includes("|"))).toEqual([
      "location:workshop",
      "location:opened",
    ]);
  });

  it("draws a folded group's heading alone until a search opens it", () => {
    const folded = new Set(["location:workshop"]);
    const args = { projects, groupBy: "location" as const, collapsedGroups: folded, roster };

    expect(keys(buildProjectRows({ ...args, narrowed: false }))).not.toContain(
      "location:workshop|X:/mods/b",
    );
    expect(keys(buildProjectRows({ ...args, narrowed: true }))).toContain(
      "location:workshop|X:/mods/b",
    );
  });
});
