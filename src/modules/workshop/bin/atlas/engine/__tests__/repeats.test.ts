import { describe, expect, it } from "vitest";

import { FULL_SAFE_ZONE, type LayoutSettings, solve } from "../layout/solve";
import { followers, templateElements, viewRepeats, withCopies } from "../model/repeats";
import { buildTree, type CopyPlace } from "../model/tree";
import type { ViewLayout, ViewLook } from "../model/view";
import { element, icon, rect, scene, view } from "./fixtures";

const SETTINGS: LayoutSettings = {
  screen: { width: 1600, height: 1200 },
  hud: 1,
  safeZone: FULL_SAFE_ZONE,
};

const STEP: CopyPlace = { kind: "step", measure: "tip", axis: 1, steps: 1 };

function group(children: string[], layout: ViewLayout | null = null): ViewLook {
  return {
    kind: "group",
    children,
    states: [],
    alpha: 1,
    layout,
    button: null,
    meter: null,
  } as ViewLook;
}

const REGION: ViewLook = { kind: "region" };

const LIST: ViewLayout = {
  region: "region",
  kind: "horizontalList",
  justify: [0, 0],
  fill: [0, 0],
  fillPriority: 0,
  cross: [0, 0],
  ignoreDisabled: false,
};

function cards() {
  return buildTree(
    view(
      [scene("card", 0), scene("badges", 0, "card"), scene("other", 0)],
      [
        element("frame", "card", 0, group(["badge"]), rect(10, 20, 100, 200)),
        element("badge", "badges", 0, icon(), rect(30, 40, 10, 10)),
        element("tip", "other", 0, icon()),
      ],
    ),
  );
}

/** A layout filled with three copies of `template`, a group holding `pip`. */
function filled() {
  const built = view(
    [scene("s", 0)],
    [
      element("template", "s", 0, group(["pip"]), rect(500, 500, 40, 40)),
      element("pip", "s", 0, icon(), rect(500, 500, 40, 40)),
      element("list", "s", 0, group(["region"], LIST), null),
      element("region", "s", 0, REGION, rect(100, 200, 60, 40)),
    ],
  );
  return withCopies(
    buildTree({ ...built, repeats: [{ template: "template", layout: "list", count: 3 }] }),
  );
}

function at(solved: ReadonlyMap<string, { x: number; y: number }>, key: string) {
  const rect = solved.get(key);
  return rect === undefined ? undefined : [rect.x, rect.y];
}

describe("templateElements", () => {
  it("holds every element a scene and the scenes under it draw", () => {
    expect([...templateElements(cards(), "card")].sort()).toEqual(["badge", "frame"]);
  });
});

describe("withCopies", () => {
  it("copies a template once per place, each copy under the copy of its group", () => {
    const tree = withCopies(cards(), [{ template: "card", places: [STEP, STEP] }]);

    expect([...tree.copies.keys()]).toEqual(["frame#0.0", "badge#0.0", "frame#0.1", "badge#0.1"]);
    expect(tree.copies.get("frame#0.0")).toEqual({
      original: "frame",
      clone: "0.0",
      group: null,
      place: STEP,
    });
    expect(tree.copies.get("badge#0.1")?.group).toBe("frame#0.1");
    expect(tree.copiesIn.get("frame#0.1")).toEqual(["badge#0.1"]);
  });

  it("leaves a tree with nothing to copy as it is", () => {
    const tree = cards();

    expect(withCopies(tree, [])).toBe(tree);
  });
});

describe("solve with copies", () => {
  it("steps a copy by the size of what it measures, carrying what its group holds", () => {
    const tree = withCopies(cards(), [{ template: "card", places: [STEP, { ...STEP, steps: 2 }] }]);

    const solved = solve(tree, SETTINGS);

    expect(at(solved, "frame#0.0")).toEqual([10, 120]);
    expect(at(solved, "frame#0.1")).toEqual([10, 220]);
    expect(at(solved, "badge#0.1")).toEqual([30, 240]);
  });

  it("places the copies a layout fills as more of its children, its union holding them", () => {
    const solved = solve(filled(), SETTINGS);

    expect(["template#0.0", "template#0.1", "template#0.2"].map((key) => at(solved, key))).toEqual([
      [100, 200],
      [140, 200],
      [180, 200],
    ]);
    expect(at(solved, "pip#0.2")).toEqual([180, 200]);
    expect(at(solved, "template")).toEqual([500, 500]);
    expect(solved.get("list")).toEqual({ x: 100, y: 200, w: 120, h: 40 });
  });
});

describe("viewRepeats", () => {
  it("steps each team's row down by the slot height, a team of five", () => {
    const tree = withCopies(
      buildTree(
        view(
          [scene("SB_T1P0", 0), scene("SB_T2P0", 0)],
          [
            element("SB_PlayerSlotHeightRef", "SB_T1P0", 0, REGION, rect(0, 0, 600, 84)),
            element("row", "SB_T1P0", 0, icon(), rect(10, 20, 100, 50)),
          ],
        ),
      ),
    );

    const solved = solve(tree, SETTINGS);

    expect(viewRepeats(tree).map((repeat) => repeat.template)).toEqual(["SB_T1P0", "SB_T2P0"]);
    expect(["row#0.0", "row#0.3"].map((key) => at(solved, key))).toEqual([
      [10, 104],
      [10, 356],
    ]);
  });

  it("lays five player cards across each region, the template first in the upper one", () => {
    const tree = withCopies(
      buildTree(
        view(
          [scene("LoadingScreen_PlayerCard", 0), scene("regions", 0)],
          [
            element("card", "LoadingScreen_PlayerCard", 0, icon(), rect(0, 36, 300, 500)),
            element(
              "LoadingScreenPlayers_UpperCardRegion",
              "regions",
              0,
              REGION,
              rect(0, 36, 1500, 500),
            ),
            element(
              "LoadingScreenPlayers_LowerCardRegion",
              "regions",
              0,
              REGION,
              rect(0, 600, 1500, 500),
            ),
          ],
        ),
      ),
    );

    const solved = solve(tree, SETTINGS);

    expect(viewRepeats(tree)[0]?.places).toHaveLength(9);
    expect(at(solved, "card#0.0")).toEqual([0, 600]);
    expect(at(solved, "card#0.7")).toEqual([1200, 36]);
  });
});

describe("followers", () => {
  it("carries a moved element's copies along", () => {
    const tree = withCopies(cards(), [{ template: "card", places: [STEP] }]);

    expect(followers(tree, new Set(["frame", "badge"]))).toEqual(["frame#0.0", "badge#0.0"]);
  });

  it("leaves a copy a layout places where it is, but carries what it holds", () => {
    const tree = filled();

    expect(followers(tree, new Set(["template", "pip"]))).toEqual([]);
    expect(followers(tree, new Set(["pip"]))).toEqual(["pip#0.0", "pip#0.1", "pip#0.2"]);
  });
});
