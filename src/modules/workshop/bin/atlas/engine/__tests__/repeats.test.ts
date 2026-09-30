import { describe, expect, it } from "vitest";

import type { PixelRect } from "../layout/solve";
import { NO_OVERLAY } from "../model/combo";
import { repeatClones, templateElements, viewRepeats, withClones } from "../model/repeats";
import { buildTree } from "../model/tree";
import type { ViewLayout, ViewLook } from "../model/view";
import { element, icon, scene, view } from "./fixtures";

function cards() {
  return buildTree(
    view(
      [scene("card", 0), scene("badges", 0, "card"), scene("other", 0)],
      [
        element("frame", "card", 0, icon()),
        element("badge", "badges", 0, icon()),
        element("tip", "other", 0, icon()),
      ],
    ),
  );
}

const SOLVED = new Map<string, PixelRect>([
  ["frame", { x: 10, y: 20, w: 100, h: 200 }],
  ["badge", { x: 30, y: 40, w: 10, h: 10 }],
  ["tip", { x: 0, y: 0, w: 5, h: 5 }],
]);

describe("templateElements", () => {
  it("holds every element a scene and the scenes under it draw", () => {
    expect([...templateElements(cards(), "card")].sort()).toEqual(["badge", "frame"]);
  });
});

describe("repeatClones", () => {
  it("draws each shown element of the template once per offset", () => {
    const clones = repeatClones(
      cards(),
      SOLVED,
      [
        {
          template: "card",
          offsets: [
            [100, 0],
            [0, 300],
          ],
        },
      ],
      new Set(["frame", "tip"]),
    );

    expect(clones.map((clone) => [clone.element, clone.rect.x, clone.rect.y])).toEqual([
      ["frame", 110, 20],
      ["frame", 10, 320],
    ]);
    expect(clones.every((clone) => clone.text === null)).toBe(true);
  });

  it("adds the copies to what the overlay already clones", () => {
    const clones = repeatClones(
      cards(),
      SOLVED,
      [{ template: "card", offsets: [[1, 0]] }],
      new Set(["frame"]),
    );

    expect(withClones(NO_OVERLAY, clones).clones).toHaveLength(1);
    expect(withClones(NO_OVERLAY, [])).toBe(NO_OVERLAY);
  });
});

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

describe("viewRepeats", () => {
  it("steps each team's row down by the slot height, a team of five", () => {
    const tree = buildTree(
      view(
        [scene("SB_T1P0", 0), scene("SB_T2P0", 0)],
        [element("SB_PlayerSlotHeightRef", "SB_T1P0", 0, REGION)],
      ),
    );
    const solved = new Map([["SB_PlayerSlotHeightRef", { x: 0, y: 0, w: 600, h: 84 }]]);

    const repeats = viewRepeats(tree, solved);

    expect(repeats.map((repeat) => repeat.template)).toEqual(["SB_T1P0", "SB_T2P0"]);
    expect(repeats[0]?.offsets).toEqual([
      [0, 84],
      [0, 168],
      [0, 252],
      [0, 336],
    ]);
  });

  it("lays five player cards across each region, the template first in the upper one", () => {
    const tree = buildTree(
      view(
        [scene("LoadingScreen_PlayerCard", 0), scene("regions", 0)],
        [
          element("LoadingScreenPlayers_UpperCardRegion", "regions", 0, REGION),
          element("LoadingScreenPlayers_LowerCardRegion", "regions", 0, REGION),
        ],
      ),
    );
    const solved = new Map([
      ["LoadingScreenPlayers_UpperCardRegion", { x: 0, y: 36, w: 1920, h: 720 }],
      ["LoadingScreenPlayers_LowerCardRegion", { x: 0, y: 734, w: 1920, h: 720 }],
    ]);

    const [cards] = viewRepeats(tree, solved);

    expect(cards?.offsets).toHaveLength(9);
    expect(cards?.offsets).toContainEqual([0, 698]);
    expect(cards?.offsets).toContainEqual([1536, 0]);
  });

  it("fills a layout with the copies its controller names, placed by that layout", () => {
    const layout: ViewLayout = {
      region: "region",
      kind: "horizontalList",
      justify: [0, 0],
      fill: [0, 0],
      fillPriority: 0,
      cross: [0, 0],
      ignoreDisabled: false,
    };
    const built = view(
      [scene("s", 0)],
      [
        element("template", "s", 0, icon()),
        element("list", "s", 0, group(["region"], layout)),
        element("region", "s", 0, REGION),
      ],
    );
    const tree = buildTree({
      ...built,
      repeats: [{ template: "template", layout: "list", count: 3 }],
    });
    const solved = new Map([
      ["template", { x: 500, y: 500, w: 40, h: 40 }],
      ["region", { x: 100, y: 200, w: 400, h: 40 }],
    ]);

    const [fill] = viewRepeats(tree, solved);

    expect(fill?.template).toBe("template");
    expect(fill?.offsets).toEqual([
      [-400, -300],
      [-360, -300],
      [-320, -300],
    ]);
  });
});
