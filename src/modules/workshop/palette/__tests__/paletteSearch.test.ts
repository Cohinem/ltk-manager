import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildCandidate, buildCommandCandidate } from "../candidate";
import { parseQuery, PROJECT_SOURCES, WORKSHOP_SOURCES } from "../sources";
import type { PaletteCandidates, PaletteSourceId } from "../types";
import { usePaletteSearch } from "../usePaletteSearch";

const commands = [
  { id: "settings.open", title: "Open settings", group: "Settings", run: () => {} },
  { id: "game.rebuildIndex", title: "Rebuild the game index", group: "Game", run: () => {} },
].map(buildCommandCandidate);

/* Named for the same word a command carries, so a group that should have been
   filtered out cannot hide behind matching nothing. */
const files = [
  buildCandidate({
    id: "file:base:settings.bin",
    source: "files",
    name: "settings.bin",
    path: "data",
    icon: null,
    target: { kind: "layerFile", layerName: "base", path: "data/settings.bin" },
  }),
];

const documents = [
  buildCandidate({
    id: "doc:details",
    source: "documents",
    name: "Mod details",
    path: "",
    icon: null,
    target: { kind: "layerFile", layerName: "base", path: "details" },
  }),
];

const layers = [
  buildCandidate({
    id: "layer:base",
    source: "layers",
    name: "Base",
    path: "",
    icon: null,
    target: { kind: "layerFile", layerName: "base", path: "" },
  }),
];

const projects = [
  buildCandidate({
    id: "project:settings-demo",
    source: "projects",
    name: "Settings Demo",
    path: "Someone",
    icon: null,
    target: { kind: "project", name: "settings-demo" },
  }),
];

function search(
  query: string,
  sources: readonly PaletteSourceId[],
  candidates: PaletteCandidates = { commands, files, projects },
) {
  const { result } = renderHook(() =>
    usePaletteSearch({ parsed: parseQuery(query, null), sources, candidates }),
  );
  return result.current;
}

function sourcesOf(
  query: string,
  sources: readonly PaletteSourceId[],
  candidates?: PaletteCandidates,
): Set<PaletteSourceId> {
  return new Set(search(query, sources, candidates).map((group) => group.source));
}

describe("usePaletteSearch", () => {
  it("reads only the sources the context holds", () => {
    expect(sourcesOf("settings", WORKSHOP_SOURCES)).toEqual(new Set(["projects", "commands"]));
  });

  it("reads every source a project holds", () => {
    expect(sourcesOf("settings", PROJECT_SOURCES)).toEqual(
      new Set(["projects", "files", "commands"]),
    );
  });

  it("draws no group for a source it was handed nothing for", () => {
    expect(sourcesOf("settings", PROJECT_SOURCES, { commands })).toEqual(new Set(["commands"]));
  });

  it("lists only the prefixes the context can reach", () => {
    const rows = search("?", WORKSHOP_SOURCES)[0]!.rows;

    expect(rows.map((row) => row.row.name.charAt(0))).toEqual(["/", ">"]);
  });

  it("lists every prefix a project can reach", () => {
    expect(search("?", PROJECT_SOURCES)[0]!.rows).toHaveLength(3);
  });

  it("keeps the alias off the listing, so the help stays one row per source", () => {
    const rows = search("?", WORKSHOP_SOURCES)[0]!.rows;

    expect(rows.every((row) => !row.row.name.startsWith("~"))).toBe(true);
  });
});

describe("the empty listing", () => {
  it("keeps the grid out of a project's listing, where the open tabs answer", () => {
    expect([...sourcesOf("", PROJECT_SOURCES)]).not.toContain("projects");
  });

  it("answers the workshop with its projects, which is the only history it has", () => {
    expect(sourcesOf("", WORKSHOP_SOURCES)).toEqual(new Set(["projects", "commands"]));
  });

  /* A click opens the box on this listing, so one tab open still has to fill
     the panel - the layers are the rest of where a project can go. */
  it("fills a project's listing with its layers as well as its open tabs", () => {
    expect(sourcesOf("", PROJECT_SOURCES, { documents, layers, commands })).toEqual(
      new Set(["documents", "layers", "commands"]),
    );
  });

  it("still keeps the files out of it, which are thousands of rows", () => {
    expect([...sourcesOf("", PROJECT_SOURCES, { documents, files, commands })]).not.toContain(
      "files",
    );
  });

  /* The cards are already behind the box, so the half a user cannot see leads. */
  it("leads the workshop's listing with the commands rather than the cards", () => {
    expect(search("", WORKSHOP_SOURCES).map((group) => group.source)).toEqual([
      "commands",
      "projects",
    ]);
  });

  it("keeps a project's own tabs at the head of its listing", () => {
    const groups = search("", PROJECT_SOURCES, { documents, layers, commands });

    expect(groups.map((group) => group.source)).toEqual(["documents", "layers", "commands"]);
  });

  it("shows the first few commands and counts the rest away", () => {
    const many = Array.from({ length: 8 }, (_, at) =>
      buildCommandCandidate({
        id: `cmd.${at}`,
        title: `Command ${at}`,
        group: "Test",
        run: () => {},
      }),
    );

    const group = search("", WORKSHOP_SOURCES, { commands: many, projects })[0]!;

    expect(group.rows).toHaveLength(5);
    expect(group.total).toBe(8);
  });

  it("lists a source in full once a scope has narrowed to it", () => {
    const { result } = renderHook(() =>
      usePaletteSearch({
        parsed: parseQuery("", "projects"),
        sources: WORKSHOP_SOURCES,
        candidates: { projects },
      }),
    );

    expect(result.current[0]!.rows).toHaveLength(projects.length);
  });
});
