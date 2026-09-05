// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildCandidate, buildCommandCandidate } from "../candidate";
import { parseQuery, PROJECT_SOURCES, WORKSHOP_SOURCES } from "../sources";
import type {
  BackendRankedGroups,
  PaletteCandidates,
  PaletteGroup,
  PaletteSourceId,
} from "../types";
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

const settings = [
  buildCandidate({
    id: "setting:appearance.theme",
    source: "settings",
    name: "Theme",
    path: "Appearance",
    keywords: "appearance.theme",
    icon: null,
    target: {
      kind: "command",
      command: { id: "appearance.theme", title: "Theme", group: "Settings", run: () => {} },
    },
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
    expect(search("?", PROJECT_SOURCES)[0]!.rows).toHaveLength(4);
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

describe("the settings source", () => {
  /* Forty-five rows would bury the handful of commands someone opened the bar
     to read, so nothing lists them until a query says what to look for. */
  it("stays out of a resting listing", () => {
    expect([...sourcesOf("", WORKSHOP_SOURCES, { commands, projects, settings })]).not.toContain(
      "settings",
    );
  });

  it("answers a typed query on either surface", () => {
    expect(sourcesOf("theme", WORKSHOP_SOURCES, { settings })).toEqual(new Set(["settings"]));
    expect(sourcesOf("theme", PROJECT_SOURCES, { settings })).toEqual(new Set(["settings"]));
  });

  /* The id is the one name a reader who already knows the setting would type,
     and it is not on screen for a match to mark. */
  it("matches the public id as a keyword", () => {
    expect(sourcesOf("appearance.theme", WORKSHOP_SOURCES, { settings })).toEqual(
      new Set(["settings"]),
    );
  });
});

describe("a backend-ranked source", () => {
  /* Scores rising down the list and names the query does not hold, so a group
     the hook matched or sorted itself cannot come back looking untouched. */
  function rankedGroup(count: number, total = count): PaletteGroup {
    const rows = Array.from({ length: count }, (_, at) => ({
      row: {
        id: `game:${at}`,
        source: "game" as const,
        name: `chunk-${at}.bin`,
        path: "data",
        icon: null,
        target: {
          kind: "gameChunk" as const,
          wad: "Aatrox.wad.client",
          pathHash: `${at}`,
          path: `data/chunk-${at}.bin`,
        },
      },
      band: 2,
      score: at,
      nameRanges: [],
      pathRanges: [],
    }));
    return { source: "game", label: "Game", rows, total };
  }

  function searchRanked(
    query: string,
    scope: PaletteSourceId | null,
    ranked: BackendRankedGroups,
    candidates: PaletteCandidates = {},
  ) {
    const { result } = renderHook(() =>
      usePaletteSearch({
        parsed: parseQuery(query, scope),
        sources: PROJECT_SOURCES,
        candidates,
        ranked,
      }),
    );
    return result.current;
  }

  it("takes the group as handed, neither matching nor ranking its rows", () => {
    const group = rankedGroup(3);

    expect(searchRanked("settings", null, { game: group })).toEqual([group]);
  });

  it("trims a shared list to the cap and keeps the backend's total", () => {
    const group = searchRanked("settings", null, { game: rankedGroup(12, 40) })[0]!;

    expect(group.rows).toHaveLength(8);
    expect(group.total).toBe(40);
  });

  it("lists the group in full under its own scope", () => {
    const group = searchRanked("settings", "game", { game: rankedGroup(12) })[0]!;

    expect(group.rows).toHaveLength(12);
  });

  it("draws nothing for a source that answered nothing", () => {
    expect(searchRanked("settings", null, { game: null })).toEqual([]);
    expect(searchRanked("settings", null, {})).toEqual([]);
  });

  /* The same rows under the objects source, which is the second backend-ranked
     one and the reason the flag replaced a hard-coded id. */
  function objectsGroup(count: number, total = count): PaletteGroup {
    const rows = Array.from({ length: count }, (_, at) => ({
      row: {
        id: `object:${at}`,
        source: "objects" as const,
        name: `characters/aatrox/skins/skin${at}`,
        path: "SkinCharacterDataProperties · data/skin.bin",
        icon: null,
        target: {
          kind: "object" as const,
          wad: "Aatrox.wad.client",
          pathHash: "0",
          path: "data/skin.bin",
          objectHash: `0x${at}`,
        },
      },
      band: 2,
      score: at,
      nameRanges: [],
      pathRanges: [],
    }));
    return { source: "objects", label: "Objects", rows, total };
  }

  it("folds every backend-ranked group in, each trimmed to its own cap", () => {
    const groups = searchRanked("skin", null, {
      game: rankedGroup(12, 20),
      objects: objectsGroup(12, 30),
    });

    expect(groups.map((group) => group.source)).toEqual(["game", "objects"]);
    expect(groups[0]!.rows).toHaveLength(8);
    expect(groups[1]!.rows).toHaveLength(4);
    expect(groups[1]!.total).toBe(30);
  });

  it("lists the objects alone and in full under their own scope", () => {
    const groups = searchRanked("skin", "objects", {
      game: rankedGroup(3),
      objects: objectsGroup(12),
    });

    expect(groups.map((group) => group.source)).toEqual(["objects"]);
    expect(groups[0]!.rows).toHaveLength(12);
  });

  /* The band and score are the backend's own verdict, carried through so the
     group sorts against the frontend's by the same rule. */
  it("orders the group against the frontend's by its best row", () => {
    const behind = rankedGroup(1);
    const ahead = { ...behind, rows: [{ ...behind.rows[0]!, band: 0, score: 100 }] };

    const orderOf = (ranked: BackendRankedGroups) =>
      searchRanked("settings", null, ranked, { files }).map((group) => group.source);

    expect(orderOf({ game: behind })).toEqual(["files", "game"]);
    expect(orderOf({ game: ahead })).toEqual(["game", "files"]);
  });
});
