import { describe, expect, it } from "vitest";

import { letterMask } from "../matcher";
import { rankCandidate, rankCandidates } from "../rank";
import type { PaletteCandidate } from "../types";
import fixture from "./ranking.fixture.json";

const NO_CONTEXT = { selectedLayer: null, recent: [] };

/** A file candidate built the way `useProjectCandidates` builds one. */
function file(relativePath: string, layerName = "base"): PaletteCandidate {
  const cut = relativePath.lastIndexOf("/");
  const name = cut < 0 ? relativePath : relativePath.slice(cut + 1);
  const path = cut < 0 ? "" : relativePath.slice(0, cut);
  const nameLower = name.toLowerCase();
  const fullLower = path.length > 0 ? `${path.toLowerCase()}/${nameLower}` : nameLower;

  return {
    id: `file:${layerName}:${relativePath}`,
    source: "files",
    name,
    path,
    layerName,
    icon: null,
    target: { kind: "layerFile", layerName, path: relativePath },
    documentId: `preview:layer:${layerName}:${relativePath}`,
    nameLower,
    fullLower,
    mask: letterMask(fullLower),
  };
}

/** An object candidate built the way `useProjectCandidates` builds one. */
function object(objectPath: string, layerName = "base"): PaletteCandidate {
  const cut = objectPath.lastIndexOf("/");
  const nameLower = objectPath.toLowerCase();

  return {
    id: `object:${layerName}:data/objects.bin:${objectPath}`,
    source: "projectObjects",
    name: objectPath,
    nameCut: cut < 0 ? undefined : cut + 1,
    path: "Object · data/objects.bin",
    layerName,
    icon: null,
    target: {
      kind: "layerObject",
      layerName,
      path: "data/objects.bin",
      objectHash: objectPath,
      objectPath,
    },
    nameLower,
    fullLower: nameLower,
    mask: letterMask(nameLower),
  };
}

function command(title: string, keywords: string): PaletteCandidate {
  const nameLower = title.toLowerCase();
  return {
    id: `command:${title}`,
    source: "commands",
    name: title,
    path: "",
    keywords,
    icon: null,
    target: { kind: "command", command: { id: title, title, group: "Test", run: () => {} } },
    nameLower,
    fullLower: nameLower,
    mask: letterMask(`${nameLower} ${keywords}`),
  };
}

describe("rankCandidate", () => {
  it("bands a name prefix first", () => {
    const row = rankCandidate("aat", file("skins/aatrox.bin"), NO_CONTEXT);
    expect(row?.band).toBe(0);
  });

  it("bands a name the query does not open second", () => {
    const row = rankCandidate("trox", file("skins/aatrox.bin"), NO_CONTEXT);
    expect(row?.band).toBe(1);
  });

  it("bands a match reaching the directory third", () => {
    const row = rankCandidate("skins", file("skins/aatrox.bin"), NO_CONTEXT);
    expect(row?.band).toBe(2);
  });

  it("marks the name alone when the name matched", () => {
    const row = rankCandidate("aat", file("skins/aatrox.bin"), NO_CONTEXT);
    expect(row?.nameRanges).toEqual([[0, 3]]);
    expect(row?.pathRanges).toEqual([]);
  });

  it("splits a run that crosses from the directory into the name", () => {
    const row = rankCandidate("skins/aatrox", file("skins/aatrox.bin"), NO_CONTEXT);
    expect(row?.band).toBe(2);
    expect(row?.pathRanges.length).toBeGreaterThan(0);
    expect(row?.nameRanges.length).toBeGreaterThan(0);
  });

  it("reads every term across the directory and the name", () => {
    const row = rankCandidate("skins aatrox", file("skins/aatrox.bin"), NO_CONTEXT);
    expect(row?.band).toBe(2);
  });

  /* A project holding no `nasus` answered with 67 rows that scattered its five
     letters across `assets/.../sounds/...`, above the install's own nasus.bin. */
  it("reports no match for a query scattered across an unrelated path", () => {
    const scattered = file("assets/characters/smolder/sounds/charizard_sfx_audio.bnk");
    expect(rankCandidate("nasus", scattered, NO_CONTEXT)).toBeNull();
  });

  it("matches the words a row carries but does not show", () => {
    const row = rankCandidate(
      "archive",
      command("Rebuild the game index", "wad archive"),
      NO_CONTEXT,
    );
    expect(row?.band).toBe(2);
    expect(row?.nameRanges).toEqual([]);
  });

  it("reports no match when a term is in neither the row nor its keywords", () => {
    const row = rankCandidate("zed", command("Rebuild the game index", "wad archive"), NO_CONTEXT);
    expect(row).toBeNull();
  });

  it("reports no match when neither the path nor the keywords hold the query", () => {
    expect(rankCandidate("zed", file("skins/aatrox.bin"), NO_CONTEXT)).toBeNull();
  });

  it("lifts a candidate in the open layer above the same one elsewhere", () => {
    const open = rankCandidate("aatrox", file("skins/aatrox.bin", "base"), {
      selectedLayer: "base",
      recent: [],
    });
    const other = rankCandidate("aatrox", file("skins/aatrox.bin", "extra"), {
      selectedLayer: "base",
      recent: [],
    });
    expect(open!.score).toBeGreaterThan(other!.score);
  });

  it("lifts a recent candidate, and lifts the nearest one most", () => {
    const candidate = file("skins/aatrox.bin");
    const visited = candidate.documentId!;
    const near = rankCandidate("aatrox", candidate, { selectedLayer: null, recent: [visited] });
    const far = rankCandidate("aatrox", candidate, {
      selectedLayer: null,
      recent: ["a", "b", "c", visited],
    });
    const cold = rankCandidate("aatrox", candidate, NO_CONTEXT);

    expect(near!.score).toBeGreaterThan(far!.score);
    expect(far!.score).toBeGreaterThan(cold!.score);
  });

  /* A file row and the tab showing that file are two rows of two sources, so
     the history has to reach the row by the tab it opens. */
  it("lifts a file row by the tab it opens, not by its own row key", () => {
    const candidate = file("skins/aatrox.bin");
    const byTab = rankCandidate("aatrox", candidate, {
      selectedLayer: null,
      recent: [candidate.documentId!],
    });
    const byRow = rankCandidate("aatrox", candidate, {
      selectedLayer: null,
      recent: [candidate.id],
    });

    expect(byTab!.score).toBeGreaterThan(byRow!.score);
  });
});

describe("rankCandidates", () => {
  it("drops everything that does not match", () => {
    const rows = rankCandidates("aatrox", [file("a.bin"), file("aatrox.bin")], NO_CONTEXT);
    expect(rows.map((row) => row.row.name)).toEqual(["aatrox.bin"]);
  });

  /* The fixture both scorers share. A change here is a change to the ranking
     rule, not to this test. */
  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const reject: string[] = testCase.reject ?? [];
      const held = [...testCase.expect, ...reject].reverse().map((path) => file(path));
      const rows = rankCandidates(testCase.query, held, NO_CONTEXT);

      expect(rows.map((row) => row.row.target)).toEqual(
        testCase.expect.map((path) => ({ kind: "layerFile", layerName: "base", path })),
      );
    });
  }
});

describe("an object path as one name", () => {
  it("bands the last segment as the name and marks it in place", () => {
    const row = rankCandidate("skin0", object("characters/aatrox/skins/skin0"), NO_CONTEXT);

    expect(row?.band).toBe(0);
    expect(row?.nameRanges).toEqual([["characters/aatrox/skins/".length, 29]]);
    expect(row?.pathRanges).toEqual([]);
  });

  it("bands a match the rest of the path is needed for third", () => {
    const row = rankCandidate("aatrox", object("characters/aatrox/skins/skin0"), NO_CONTEXT);

    expect(row?.band).toBe(2);
    expect(row?.nameRanges).toEqual([[11, 17]]);
  });

  it("never reads the description under it as a location", () => {
    expect(rankCandidate("objects.bin", object("characters/aatrox"), NO_CONTEXT)).toBeNull();
  });

  /* The same fixture cases, as the project's objects rather than as files.
     The Rust suite reads them as the install's. */
  for (const testCase of fixture.cases.filter((c) => !c.expect[0]!.includes("."))) {
    it(testCase.name, () => {
      const reject: string[] = testCase.reject ?? [];
      const held = [...testCase.expect, ...reject].reverse().map((path) => object(path));
      const rows = rankCandidates(testCase.query, held, NO_CONTEXT);

      expect(rows.map((row) => row.row.name)).toEqual(testCase.expect);
    });
  }
});
