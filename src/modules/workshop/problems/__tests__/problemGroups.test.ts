import { describe, expect, it } from "vitest";

import type { NodeAddress, Problem, ProblemSeverity, RuleInfo } from "@/lib/tauri";

import {
  countBySeverity,
  filterProblems as filterWith,
  flattenGroups,
  groupProblems as groupWith,
  isMuted,
  mutedRules,
  problemAddress,
  type ProblemGroup,
  shownProblems,
} from "../problemGroups";

/** A run that named no object, which is what one with no hashtable cache is. */
const UNNAMED: ReadonlyMap<string, string> = new Map();

/* The catalogue is one case here rather than the subject of most of these, so
   both helpers default to the run that named nothing. */
function groupProblems(problems: readonly Problem[], names = UNNAMED) {
  return groupWith(problems, names);
}

function filterProblems(problems: readonly Problem[], query: string, names = UNNAMED) {
  return filterWith(problems, query, names);
}

interface ProblemInit {
  id?: string;
  rule?: string;
  severity?: ProblemSeverity;
  layer?: string;
  path?: string;
  node?: NodeAddress | null;
  message?: string;
}

let minted = 0;

function problem(init: ProblemInit = {}): Problem {
  minted += 1;
  return {
    id: init.id ?? `problem-${minted}`,
    rule: init.rule ?? "bin/asset-exists",
    severity: init.severity ?? "error",
    site: {
      layer: init.layer ?? "base",
      path: init.path ?? "data/characters/smolder/skins/skin0.bin",
      node: init.node ?? null,
    },
    message: init.message ?? "The file this property names is not in the project.",
    fix: null,
  };
}

function labels(groups: readonly ProblemGroup[]): string[] {
  return groups.map((group) => `${group.layer}/${group.path}`);
}

function ids(problems: readonly Problem[]): string[] {
  return problems.map(({ id }) => id);
}

describe("groupProblems", () => {
  it("puts two problems from one file in one group and keeps two files apart", () => {
    const groups = groupProblems([
      problem({ id: "a", path: "skins/skin0.bin" }),
      problem({ id: "b", path: "skins/skin1.bin" }),
      problem({ id: "c", path: "skins/skin0.bin" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.path === "skins/skin0.bin")?.problems).toHaveLength(2);
    expect(groups.find((group) => group.path === "skins/skin1.bin")?.problems).toHaveLength(1);
  });

  it("keeps one relative path in two layers as two groups", () => {
    const groups = groupProblems([
      problem({ layer: "base", path: "skins/skin0.bin" }),
      problem({ layer: "high-res", path: "skins/skin0.bin" }),
    ]);

    expect(labels(groups)).toEqual(["base/skins/skin0.bin", "high-res/skins/skin0.bin"]);
    expect(new Set(groups.map((group) => group.id)).size).toBe(2);
  });

  /* The worst severity is the whole group's, not that of whichever problem the
     backend happened to sort into it first. */
  it("orders groups by worst severity, then layer, then path", () => {
    const groups = groupProblems([
      problem({ severity: "info", layer: "aaa", path: "note.bin" }),
      problem({ severity: "warning", layer: "aaa", path: "warn.bin" }),
      problem({ severity: "warning", layer: "zzz", path: "mixed.bin" }),
      problem({ severity: "error", layer: "zzz", path: "mixed.bin" }),
      problem({ severity: "error", layer: "base", path: "b.bin" }),
      problem({ severity: "error", layer: "base", path: "a.bin" }),
    ]);

    expect(labels(groups)).toEqual([
      "base/a.bin",
      "base/b.bin",
      "zzz/mixed.bin",
      "aaa/warn.bin",
      "aaa/note.bin",
    ]);
  });

  /// A crash outranks a rejection, so the file that crashes the game sorts to
  /// the top even where another file holds more of everything else.
  it("sorts a file that crashes the game above one that only errors", () => {
    const groups = groupProblems([
      problem({ severity: "error", layer: "base", path: "a.bin" }),
      problem({ severity: "error", layer: "base", path: "a.bin" }),
      problem({ severity: "fatal", layer: "base", path: "z.bin" }),
    ]);

    expect(labels(groups)).toEqual(["base/z.bin", "base/a.bin"]);
  });

  it("counts each severity in a group", () => {
    const [group] = groupProblems([
      problem({ severity: "warning", path: "one.bin" }),
      problem({ severity: "error", path: "one.bin" }),
      problem({ severity: "fatal", path: "one.bin" }),
      problem({ severity: "warning", path: "one.bin" }),
      problem({ severity: "info", path: "one.bin" }),
    ]);

    expect(group).toMatchObject({ fatals: 1, errors: 1, warnings: 2, infos: 1 });
  });

  it("keeps the order the backend gave within a group", () => {
    const [group] = groupProblems([
      problem({ id: "third", severity: "warning", path: "one.bin" }),
      problem({ id: "first", severity: "error", path: "one.bin" }),
      problem({ id: "second", severity: "info", path: "one.bin" }),
    ]);

    expect(ids(group?.problems ?? [])).toEqual(["third", "first", "second"]);
  });

  it("splits the path into a file name and a directory", () => {
    const [group] = groupProblems([problem({ path: "data/characters/smolder/skin0.bin" })]);

    expect(group?.fileName).toBe("skin0.bin");
    expect(group?.directory).toBe("data/characters/smolder");
  });

  it("leaves the directory empty at the layer root", () => {
    const [group] = groupProblems([problem({ path: "mod.config.json" })]);

    expect(group?.fileName).toBe("mod.config.json");
    expect(group?.directory).toBe("");
  });

  it("returns nothing for an empty run", () => {
    expect(groupProblems([])).toEqual([]);
  });

  it("leaves the list it was given alone", () => {
    const problems = [
      problem({ severity: "info", path: "b.bin" }),
      problem({ severity: "error", path: "a.bin" }),
    ];
    const before = ids(problems);

    groupProblems(problems);

    expect(ids(problems)).toEqual(before);
  });
});

describe("problemAddress", () => {
  it("names the node's property path", () => {
    const node = { entry: "0x2a1f3c7d", path: "0x45e122f8{0x05a263b1}.mAnimationFilePath" };

    expect(problemAddress(problem({ node }))).toBe(node.path);
  });

  it("falls back to the file name for a problem with no node", () => {
    expect(problemAddress(problem({ path: "data/characters/skin0.bin" }))).toBe("skin0.bin");
  });

  it("falls back to the entry hash for the object itself", () => {
    expect(problemAddress(problem({ node: { entry: "0x45e122f8", path: "" } }))).toBe("0x45e122f8");
  });
});

describe("filterProblems", () => {
  const problems = [
    problem({
      id: "hash",
      rule: "bin/property-type",
      message: "The game reads a hash now.",
      layer: "base",
      path: "data/characters/smolder/skin0.bin",
      node: { entry: "0x2a1f3c7d", path: "iconAvatar" },
    }),
    problem({
      id: "missing",
      rule: "bin/asset-exists",
      message: "This texture is not in the project.",
      layer: "high-res",
      path: "assets/characters/annie/annie_tx.dds",
    }),
  ];

  it("returns the identical array for an empty query", () => {
    expect(filterProblems(problems, "")).toBe(problems);
  });

  it("returns the identical array for a whitespace-only query", () => {
    expect(filterProblems(problems, "   \t ")).toBe(problems);
  });

  it("requires every term", () => {
    expect(ids(filterProblems(problems, "hash iconAvatar"))).toEqual(["hash"]);
    expect(filterProblems(problems, "hash annie")).toEqual([]);
  });

  it("matches the message", () => {
    expect(ids(filterProblems(problems, "texture"))).toEqual(["missing"]);
  });

  it("matches the address", () => {
    expect(ids(filterProblems(problems, "iconavatar"))).toEqual(["hash"]);
    expect(ids(filterProblems(problems, "annie_tx.dds"))).toEqual(["missing"]);
  });

  it("matches the rule id", () => {
    expect(ids(filterProblems(problems, "property-type"))).toEqual(["hash"]);
  });

  it("matches the layer", () => {
    expect(ids(filterProblems(problems, "high-res"))).toEqual(["missing"]);
  });

  it("matches the file path", () => {
    expect(ids(filterProblems(problems, "smolder"))).toEqual(["hash"]);
  });

  it("ignores case on both sides", () => {
    expect(ids(filterProblems(problems, "SMOLDER ICONAVATAR"))).toEqual(["hash"]);
  });

  /* The address and the rule id are neighbours in the searched text, so this is
     the term that would match if the fields ran together. */
  it("never matches across two fields", () => {
    expect(filterProblems(problems, "iconavatarbin")).toEqual([]);
  });

  it("keeps nothing for a term no problem holds", () => {
    expect(filterProblems(problems, "zaun")).toEqual([]);
  });
});

describe("flattenGroups", () => {
  const groups = groupProblems([
    problem({ id: "a1", severity: "error", path: "a.bin" }),
    problem({ id: "a2", severity: "error", path: "a.bin" }),
    problem({ id: "b1", severity: "warning", path: "b.bin" }),
  ]);
  const [first, second] = groups;

  it("emits only group rows when nothing is expanded", () => {
    const rows = flattenGroups(groups, new Set());

    expect(rows.map(({ kind }) => kind)).toEqual(["group", "group"]);
    expect(rows.map(({ id }) => id)).toEqual([first?.id, second?.id]);
  });

  it("expands exactly the named group", () => {
    const rows = flattenGroups(groups, new Set([first!.id]));

    expect(rows.map(({ kind }) => kind)).toEqual(["group", "problem", "problem", "group"]);
    expect(rows.filter((row) => row.kind === "problem").map(({ id }) => id)).toEqual(["a1", "a2"]);
  });

  it("carries its group on a problem row", () => {
    const rows = flattenGroups(groups, new Set([second!.id]));

    expect(rows[2]?.kind).toBe("problem");
    expect(rows[2]?.id).toBe("b1");
    expect(rows[2]?.group).toBe(second);
  });

  it("gives the virtualizer a unique id for every row", () => {
    const rows = flattenGroups(groups, new Set(groups.map(({ id }) => id)));

    expect(rows).toHaveLength(5);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
  });

  it("emits nothing for no groups", () => {
    expect(flattenGroups([], new Set())).toEqual([]);
  });
});

describe("objects", () => {
  const SKIN = "0xed746c4d";
  const PARTICLES = "0x4bda0b90";
  const NAMES = new Map([
    [SKIN, "Characters/Graves/Skins/Skin0"],
    [PARTICLES, "Characters/Graves/Skins/Skin0/Particles/Graves_Base_Spawn"],
  ]);

  function inObject(entry: string, init: ProblemInit = {}) {
    return problem({ ...init, node: { entry, path: init.node?.path ?? "mPath" } });
  }

  it("splits one file's problems by the object they sit in", () => {
    const [group] = groupProblems(
      [
        inObject(SKIN, { id: "s1" }),
        inObject(PARTICLES, { id: "p1" }),
        inObject(SKIN, { id: "s2" }),
      ],
      NAMES,
    );

    expect(group?.objects).toHaveLength(2);
    expect(group?.objects.map((object) => object.entry)).toEqual([SKIN, PARTICLES]);
    expect(ids(group?.objects[0]?.problems ?? [])).toEqual(["s1", "s2"]);
  });

  it("names an object the catalogue holds", () => {
    const [group] = groupProblems([inObject(SKIN)], NAMES);

    expect(group?.objects[0]?.name).toBe("Characters/Graves/Skins/Skin0");
  });

  /// A mod's own objects are in no table, and a hash the file itself holds is
  /// what the row falls back to rather than an empty header.
  it("falls back to the hash for an object no table names", () => {
    const [group] = groupProblems([inObject("0x0c5d54f6")], NAMES);

    expect(group?.objects[0]?.name).toBe("0x0c5d54f6");
  });

  it("orders a file's objects by worst severity, then by name", () => {
    const [group] = groupProblems(
      [
        inObject(SKIN, { severity: "warning" }),
        inObject(PARTICLES, { severity: "warning" }),
        inObject("0x00000001", { severity: "fatal" }),
      ],
      NAMES,
    );

    expect(group?.objects.map((object) => object.name)).toEqual([
      "0x00000001",
      "Characters/Graves/Skins/Skin0",
      "Characters/Graves/Skins/Skin0/Particles/Graves_Base_Spawn",
    ]);
  });

  /// A rule that reads a file as a whole names no object, and its finding still
  /// has to be reachable under the file.
  it("keeps a problem with no node out of every object", () => {
    const [group] = groupProblems([problem({ id: "whole" }), inObject(SKIN, { id: "inside" })]);

    expect(ids(group?.loose ?? [])).toEqual(["whole"]);
    expect(group?.objects).toHaveLength(1);
  });

  it("gives an object a different id in each file that holds it", () => {
    const groups = groupProblems(
      [inObject(SKIN, { path: "a.bin" }), inObject(SKIN, { path: "b.bin" })],
      NAMES,
    );

    expect(groups[0]?.objects[0]?.id).not.toBe(groups[1]?.objects[0]?.id);
  });

  it("draws an object row between its file and its problems", () => {
    const groups = groupProblems([inObject(SKIN, { id: "s1" }), problem({ id: "whole" })], NAMES);
    const rows = flattenGroups(groups, new Set([groups[0]!.id, groups[0]!.objects[0]!.id]));

    expect(rows.map(({ kind }) => kind)).toEqual(["group", "problem", "object", "problem"]);
    expect(rows.map(({ id }) => id)).toEqual([
      groups[0]?.id,
      "whole",
      groups[0]?.objects[0]?.id,
      "s1",
    ]);
  });

  it("hides an object's problems while the object is shut", () => {
    const groups = groupProblems([inObject(SKIN, { id: "s1" })], NAMES);
    const rows = flattenGroups(groups, new Set([groups[0]!.id]));

    expect(rows.map(({ kind }) => kind)).toEqual(["group", "object"]);
  });

  it("matches an object by its name and by its hash", () => {
    const problems = [inObject(SKIN, { id: "s1" }), inObject(PARTICLES, { id: "p1" })];

    expect(ids(filterProblems(problems, "particles", NAMES))).toEqual(["p1"]);
    expect(ids(filterProblems(problems, SKIN, NAMES))).toEqual(["s1"]);
  });
});

describe("countBySeverity", () => {
  it("tallies a mixed list", () => {
    expect(
      countBySeverity([
        problem({ severity: "error" }),
        problem({ severity: "info" }),
        problem({ severity: "fatal" }),
        problem({ severity: "warning" }),
        problem({ severity: "error" }),
        problem({ severity: "error" }),
      ]),
    ).toEqual({ fatals: 1, errors: 3, warnings: 1, infos: 1 });
  });

  it("returns zeroes for an empty list", () => {
    expect(countBySeverity([])).toEqual({ fatals: 0, errors: 0, warnings: 0, infos: 0 });
  });
});

describe("mutedRules", () => {
  function rule(id: string, state: RuleInfo["state"]): RuleInfo {
    return { id, title: id, description: "", state };
  }

  const WAITING = rule("bin/property-type", {
    kind: "dormant",
    waiting: "Patch 16.17",
    reason: "Riot changes how these values are stored in patch 16.17.",
    detail: null,
  });
  const RUNNING = rule("bin/asset-exists", { kind: "active" });

  it("names a check waiting on a build the game has not reached", () => {
    expect([...mutedRules([WAITING, RUNNING])]).toEqual(["bin/property-type"]);
  });

  it("names nothing while every check speaks about this game", () => {
    expect(mutedRules([RUNNING]).size).toBe(0);
  });
});

describe("isMuted", () => {
  const muted: ReadonlySet<string> = new Set(["bin/property-type"]);

  it("mutes a finding from a waiting check", () => {
    expect(isMuted(problem({ rule: "bin/property-type", severity: "warning" }), muted)).toBe(true);
  });

  it("leaves a finding from any other check alone", () => {
    expect(isMuted(problem({ rule: "bin/asset-exists", severity: "warning" }), muted)).toBe(false);
  });

  /* One rule can hold tables for several builds. A finding from a table the
     game has taken crashes it today, whatever the rule is still waiting on. */
  it("never mutes a crash", () => {
    expect(isMuted(problem({ rule: "bin/property-type", severity: "fatal" }), muted)).toBe(false);
  });
});

describe("shownProblems", () => {
  const muted: ReadonlySet<string> = new Set(["bin/property-type"]);

  const AHEAD = problem({ id: "ahead", rule: "bin/property-type", severity: "warning" });
  const CRASH = problem({ id: "crash", rule: "bin/property-type", severity: "fatal" });
  const TODAY = problem({ id: "today", rule: "bin/asset-exists", severity: "error" });

  /* Off is the default, so the panel is about the game the user has. */
  it("hides what looks ahead while the linter is off", () => {
    expect(ids(shownProblems([AHEAD, CRASH, TODAY], muted, false))).toEqual(["crash", "today"]);
  });

  it("draws everything while the linter is on", () => {
    expect(ids(shownProblems([AHEAD, CRASH, TODAY], muted, true))).toEqual([
      "ahead",
      "crash",
      "today",
    ]);
  });
});
