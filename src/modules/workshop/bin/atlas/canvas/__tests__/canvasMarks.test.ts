import { describe, expect, it } from "vitest";

import { element, icon, rect, scene, view } from "../../engine/__tests__/fixtures";
import { boardOf, onBoard } from "../../engine/layout/board";
import { NO_FRAME_CHOICES } from "../../engine/layout/frames";
import { FULL_SAFE_ZONE, solve } from "../../engine/layout/solve";
import { buildTree } from "../../engine/model/tree";
import { nestedFramesOf } from "../canvasMarks";

const SCREEN = { width: 1600, height: 1200 };

const TREE = buildTree(
  view(
    [scene("hud", 0), scene("spells", 1, "hud"), scene("buffs", 2, "spells"), scene("shop", 3)],
    [
      element("frame", "hud", 0, icon(), rect(0, 0, 800, 200)),
      element("q", "spells", 0, icon(), rect(100, 100, 50, 50)),
      element("buff", "buffs", 0, icon(), rect(300, 20, 20, 20)),
      element("item", "shop", 0, icon(), rect(10, 10, 40, 40)),
    ],
  ),
);

function nested(drawn: readonly string[]) {
  const board = boardOf(TREE, SCREEN, new Set(), false, NO_FRAME_CHOICES);
  const solved = solve(TREE, { screen: SCREEN, hud: 1, safeZone: FULL_SAFE_ZONE });
  return nestedFramesOf(board, TREE, onBoard(board, solved), drawn);
}

describe("nestedFramesOf", () => {
  it("boxes each scene under a frame's head around what it and its own scenes draw", () => {
    const frames = nested(["frame", "q", "buff", "item"]);

    expect(frames.map((frame) => [frame.scene, frame.depth, frame.rect])).toEqual([
      ["spells", 1, { x: 100, y: 20, w: 220, h: 130 }],
      ["buffs", 2, { x: 300, y: 20, w: 20, h: 20 }],
    ]);
  });

  it("leaves out a scene that draws nothing", () => {
    expect(nested(["frame", "q"]).map((frame) => frame.scene)).toEqual(["spells"]);
  });
});
