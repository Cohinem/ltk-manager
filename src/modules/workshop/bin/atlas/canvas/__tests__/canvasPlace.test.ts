import { describe, expect, it } from "vitest";

import { element, icon, rect, scene, view } from "../../engine/__tests__/fixtures";
import { FULL_SAFE_ZONE, type LayoutSettings } from "../../engine/layout/solve";
import { kindOf } from "../../engine/model/elementKinds";
import { buildTree } from "../../engine/model/tree";
import { canvasDrop } from "../canvasPlace";
import type { OverlayFrame } from "../FrameOverlay";

const SETTINGS: LayoutSettings = {
  screen: { width: 1600, height: 1200 },
  hud: 1,
  safeZone: FULL_SAFE_ZONE,
};

const TREE = buildTree(
  view(
    [scene("hud", 0), scene("spells", 1, "hud"), scene("shop", 2)],
    [
      element("frame", "hud", 0, icon(), rect(0, 0, 800, 200)),
      element("q", "spells", 0, icon(), rect(100, 100, 50, 50)),
      element("item", "shop", 0, icon(), rect(10, 10, 40, 40)),
    ],
  ),
);

const IMAGE = kindOf("UiElementIconData")!;
const GROUP = kindOf("UiElementGroupData")!;

/** Two screens side by side, the first with a nested scene boxed inside it. */
const FRAMES: OverlayFrame[] = [
  { rect: { x: 0, y: 0, w: 1600, h: 1200 }, scene: "hud", label: "hud", depth: 0 },
  { rect: { x: 1728, y: 0, w: 1600, h: 1200 }, scene: "shop", label: "shop", depth: 0 },
  { rect: { x: 100, y: 100, w: 50, h: 50 }, scene: "spells", label: "spells", depth: 1 },
];

describe("canvasDrop", () => {
  it("lands in the scene heading the screen under the point, centred on the point", () => {
    const drop = canvasDrop(TREE, IMAGE, FRAMES, SETTINGS, [800, 600], null);

    expect(drop).toEqual({
      scene: "hud",
      position: [736, 536],
      rect: { x: 736, y: 536, w: 128, h: 128 },
    });
  });

  it("reads the point on the screen it falls in, and draws the rect back on the board", () => {
    const drop = canvasDrop(TREE, IMAGE, FRAMES, SETTINGS, [1728 + 200, 300], null);

    expect(drop?.scene).toBe("shop");
    expect(drop?.position).toEqual([136, 236]);
    expect(drop?.rect).toEqual({ x: 1728 + 136, y: 236, w: 128, h: 128 });
  });

  it("lands in a nested scene inside its box", () => {
    expect(canvasDrop(TREE, IMAGE, FRAMES, SETTINGS, [120, 120], null)?.scene).toBe("spells");
  });

  it("lands nowhere between screens", () => {
    expect(canvasDrop(TREE, IMAGE, FRAMES, SETTINGS, [1650, 300], null)).toBeNull();
  });

  it("takes the scene of the element under the point on a stacked board", () => {
    const stacked: OverlayFrame[] = [
      { rect: { x: 0, y: 0, w: 1600, h: 1200 }, scene: null, label: "", depth: 0 },
    ];

    expect(canvasDrop(TREE, IMAGE, stacked, SETTINGS, [20, 20], "item")?.scene).toBe("shop");
    expect(canvasDrop(TREE, IMAGE, stacked, SETTINGS, [900, 900], null)?.scene).toBe("hud");
  });

  it("gives a kind with no rect a scene and no place", () => {
    expect(canvasDrop(TREE, GROUP, FRAMES, SETTINGS, [800, 600], null)).toEqual({
      scene: "hud",
      position: null,
      rect: null,
    });
  });
});
