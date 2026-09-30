import { describe, expect, it } from "vitest";

import { layerMatches, layerRows } from "../model/layers";
import { buildTree } from "../model/tree";
import { element, icon, scene, view } from "./fixtures";

function nested() {
  return buildTree(
    view(
      [scene("outer", 1), scene("inner", 0, "outer"), scene("other", 0)],
      [
        element("gem", "inner", 0, icon()),
        element("frame", "inner", 1, icon()),
        { ...element("title", "other", 0, { kind: "region" }), class: "UiElementTextData" },
      ],
    ),
  );
}

describe("layerMatches", () => {
  it("keeps each matched element and every scene above it", () => {
    const matches = layerMatches(nested(), "GEM");

    expect([...(matches?.matched ?? [])]).toEqual(["gem"]);
    expect([...(matches?.above ?? [])].sort()).toEqual(["inner", "outer"]);
  });

  it("matches an element's class", () => {
    expect([...(layerMatches(nested(), "textdata")?.matched ?? [])]).toEqual(["title"]);
  });

  it("finds nothing to narrow for a blank query", () => {
    expect(layerMatches(nested(), "  ")).toBeNull();
  });
});

describe("layerRows", () => {
  it("lists only what a search keeps, unfolded down to the match", () => {
    const tree = nested();
    const matches = layerMatches(tree, "gem");
    if (matches === null) throw new Error("the search matches");

    const rows = layerRows(tree, matches.above, matches.kept);

    expect(rows.map((row) => row.key)).toEqual(["outer", "inner", "gem"]);
    expect(rows.every((row) => row.type === "element" || row.folds)).toBe(true);
  });
});
