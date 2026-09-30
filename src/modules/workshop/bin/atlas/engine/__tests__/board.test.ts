import { describe, expect, it } from "vitest";

import { boardCommands } from "../commands/board";
import type { PreviewState } from "../commands/build";
import { boardOf, onBoard, toFrame } from "../layout/board";
import { drawOn, frameHeads, NO_FRAME_CHOICES, splitFrame } from "../layout/frames";
import { FULL_SAFE_ZONE, type LayoutSettings, solve } from "../layout/solve";
import { NO_OVERLAY } from "../model/combo";
import { buildTree } from "../model/tree";
import { element, icon, rect, scene, view } from "./fixtures";

const SCREEN = { width: 1600, height: 1200 };
const SETTINGS: LayoutSettings = { screen: SCREEN, hud: 1, safeZone: FULL_SAFE_ZONE };
/** The gap between frames on this screen, 8% of its width. */
const GAP = 128;
const PITCH = SCREEN.width + GAP;

const SHOWN: PreviewState = {
  hiddenScenes: new Set(),
  buttonStates: new Map(),
  meterFills: new Map(),
  showDisabled: false,
  hiddenElements: new Set(),
  effects: true,
  samples: false,
  only: null,
  overlay: NO_OVERLAY,
};

const TREE = buildTree(
  view(
    [scene("hud", 0), scene("minimap", 1, "hud"), scene("empty", 2), scene("shop", 3)],
    [
      element("bar", "hud", 0, icon()),
      element("map", "minimap", 0, icon(), rect(100, 100, 50, 50)),
      element("item", "shop", 0, icon()),
    ],
  ),
);

/** Every scene holding an element on a frame of its own. */
const APART = drawOn(TREE, NO_FRAME_CHOICES, "minimap", "minimap");

describe("boardOf", () => {
  it("draws each root scene with the scenes under it on a frame, side by side in tree order", () => {
    const board = boardOf(TREE, SCREEN, new Set(), false, NO_FRAME_CHOICES);

    expect(board.frames.map((frame) => [frame.scene, frame.scenes, frame.origin])).toEqual([
      ["hud", ["hud", "minimap"], [0, 0]],
      ["shop", ["shop"], [PITCH, 0]],
    ]);
    expect(board.size).toEqual({ width: 2 * SCREEN.width + GAP, height: SCREEN.height });
    expect(board.frameOf.get("map")).toBe(0);
  });

  it("draws a scene the reader drew apart on a frame of its own", () => {
    const board = boardOf(TREE, SCREEN, new Set(), false, APART);

    expect(board.frames.map((frame) => frame.scene)).toEqual(["hud", "minimap", "shop"]);
    expect(board.frameOf.get("map")).toBe(1);
  });

  it("leaves out a hidden scene and every scene under it", () => {
    const board = boardOf(TREE, SCREEN, new Set(["hud"]), false, APART);

    expect(board.frames.map((frame) => frame.scene)).toEqual(["shop"]);
  });

  it("wraps the frames into rows", () => {
    const keys = ["a", "b", "c", "d", "e"];
    const tree = buildTree(
      view(
        keys.map((key) => scene(key, 0)),
        keys.map((key) => element(`${key}-icon`, key, 0, icon())),
      ),
    );

    const board = boardOf(tree, SCREEN, new Set(), false, NO_FRAME_CHOICES);

    expect(board.frames.at(-1)?.origin).toEqual([0, SCREEN.height + GAP]);
    expect(board.size.height).toBe(2 * SCREEN.height + GAP);
  });

  it("stacks every scene on one screen", () => {
    const board = boardOf(TREE, SCREEN, new Set(), true, APART);

    expect(board.frames).toHaveLength(1);
    expect(board.frames[0]?.scene).toBeNull();
    expect(board.size).toBe(SCREEN);
    expect(board.frameOf.get("item")).toBe(0);
  });
});

describe("onBoard", () => {
  it("moves each rect by its frame, and a board point reads back on its frame's screen", () => {
    const board = boardOf(TREE, SCREEN, new Set(), false, APART);

    const placed = onBoard(board, solve(TREE, SETTINGS));

    expect(placed.get("map")).toMatchObject({ x: PITCH + 100, y: 100 });
    expect(toFrame(board, SCREEN, [PITCH + 10, 20])).toEqual([10, 20]);
  });
});

describe("boardCommands", () => {
  it("draws each frame's elements alone, back on a screen of their own", () => {
    const board = boardOf(TREE, SCREEN, new Set(), false, APART);
    const solved = onBoard(board, solve(TREE, SETTINGS));

    const frames = boardCommands(board, {
      tree: TREE,
      solved,
      settings: SETTINGS,
      preview: SHOWN,
      textureSizes: new Map(),
      text: null,
    });

    const drawn = frames.map((frame) =>
      frame.commands.map((command) => (command.kind === "draw" ? command.element : null)),
    );
    expect(drawn).toEqual([["bar"], ["map"], ["item"]]);
    const map = frames[1]?.commands[0];
    expect(map?.kind === "draw" ? map.geometry.positions[0] : null).toBeCloseTo(100 / 1600);
  });
});

describe("frame choices", () => {
  it("draws a scene on its parent's frame until the reader draws it elsewhere", () => {
    expect(frameHeads(TREE, NO_FRAME_CHOICES).get("minimap")).toBe("hud");
    expect(frameHeads(TREE, APART).get("minimap")).toBe("minimap");
    expect(APART).toEqual({ minimap: "minimap" });
  });

  it("takes the scenes under a scene along to the frame it joins", () => {
    const joined = drawOn(TREE, NO_FRAME_CHOICES, "hud", "shop");
    const heads = frameHeads(TREE, joined);

    expect(heads.get("hud")).toBe("shop");
    expect(heads.get("minimap")).toBe("shop");
  });

  it("drops a choice the scene would make anyway", () => {
    expect(drawOn(TREE, APART, "minimap", "hud")).toEqual({});
    expect(drawOn(TREE, NO_FRAME_CHOICES, "shop", "shop")).toEqual({});
  });

  it("splits a frame into a frame for each of its scenes", () => {
    const split = splitFrame(TREE, NO_FRAME_CHOICES, "hud", ["hud", "minimap"]);

    expect(split).toEqual(APART);
  });
});
