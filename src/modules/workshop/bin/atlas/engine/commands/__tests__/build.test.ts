import { describe, expect, it } from "vitest";

import { element, icon, rect, scene, view } from "../../__tests__/fixtures";
import { FULL_SAFE_ZONE, type LayoutSettings, solve } from "../../layout/solve";
import { NO_OVERLAY } from "../../model/combo";
import { buildTree, subtreeOf } from "../../model/tree";
import type { View, ViewElement, ViewLook } from "../../model/view";
import { buildCommands, type PreviewState, visibleElements } from "../build";

const SETTINGS: LayoutSettings = {
  screen: { width: 1600, height: 1200 },
  hud: 1,
  safeZone: FULL_SAFE_ZONE,
};

const SHOWN: PreviewState = {
  hiddenScenes: new Set(),
  buttonStates: new Map(),
  meterFills: new Map(),
  showDisabled: false,
  tooltip: null,
  hiddenElements: new Set(),
  effects: true,
  samples: false,
  only: null,
  overlay: NO_OVERLAY,
};

function commandsOf(built: View, preview: PreviewState = SHOWN) {
  const tree = buildTree(built);
  const solved = solve(tree, SETTINGS);
  return buildCommands({
    tree,
    solved,
    settings: SETTINGS,
    preview,
    textureSizes: new Map(),
    text: null,
  });
}

function drawnElements(built: View, preview?: PreviewState): string[] {
  return commandsOf(built, preview).flatMap((command) =>
    command.kind === "draw" ? [command.element] : [],
  );
}

function group(key: string, sceneKey: string, children: string[], alpha = 1): ViewElement {
  return element(
    key,
    sceneKey,
    0,
    { kind: "group", children, states: [], alpha, layout: null, button: null, meter: null },
    null,
  );
}

describe("buildCommands", () => {
  it("cuts a meter's bar to its fill, cropping the sprite only where it samples per pixel", () => {
    const meter = { bars: ["bar"], direction: 0, start: 0, enabled: true, tip: null };
    const bar = (perPixel: boolean) =>
      element("bar", "s", 1, { ...icon(), perPixelUvs: [perPixel, false] } as ViewLook);
    const drawn = (perPixel: boolean) => {
      const built = view(
        [scene("s", 0)],
        [
          element("meter", "s", 0, { ...group("meter", "s", ["bar"]).look, meter } as ViewLook),
          bar(perPixel),
        ],
      );
      const [command] = commandsOf(built, { ...SHOWN, meterFills: new Map([["meter", 0.5]]) });
      if (command?.kind !== "draw") throw new Error("no draw");
      return { right: command.geometry.positions[2], u1: command.geometry.texcoords[4] };
    };

    expect(drawn(true)).toEqual({ right: 50 / 1600, u1: 0.25 });
    expect(drawn(false)).toEqual({ right: 50 / 1600, u1: 0.5 });
  });

  it("draws an overlay's clone after its template, a shown element the file leaves off, and no hidden one", () => {
    const built = view(
      [scene("s", 0)],
      [
        element("a", "s", 0, icon()),
        { ...element("b", "s", 1, icon()), enabled: false },
        element("c", "s", 2, icon()),
      ],
    );
    const overlay = {
      ...NO_OVERLAY,
      clones: [{ element: "a", rect: { x: 0, y: 50, w: 10, h: 10 }, text: null }],
      shown: new Set(["b"]),
      hidden: new Set(["c"]),
    };

    expect(drawnElements(built, { ...SHOWN, overlay })).toEqual(["a", "a", "b"]);
  });

  it("draws only a focused group and what it holds", () => {
    const built = view(
      [scene("s", 0)],
      [
        group("row", "s", ["a", "b"]),
        element("a", "s", 0, icon()),
        element("b", "s", 1, icon()),
        element("c", "s", 2, icon()),
      ],
    );
    const only = subtreeOf(buildTree(built), "row");

    expect(drawnElements(built, { ...SHOWN, only })).toEqual(["a", "b"]);
    expect(visibleElements(buildTree(built), { ...SHOWN, only })).toEqual(["row", "a", "b"]);
  });

  it("places an element's particle system at its rect's centre, scaled by the HUD scale", () => {
    const built = view(
      [scene("s", 0)],
      [
        element(
          "fx",
          "s",
          0,
          { kind: "particle", system: "UX/Particles/Glow", scale: 2, atElementLayer: true },
          rect(100, 100, 200, 100),
        ),
      ],
    );
    const tree = buildTree(built);
    const settings = { ...SETTINGS, hud: 0.5 };

    const [command] = buildCommands({
      tree,
      solved: solve(tree, settings),
      settings,
      preview: SHOWN,
      textureSizes: new Map(),
      text: null,
    });

    expect(command).toMatchObject({
      kind: "particles",
      system: "UX/Particles/Glow",
      origin: [100, 75],
      scale: 1,
      source: [1600, 1200],
    });
  });

  it("draws by scene layer, then element layer, then file order", () => {
    const built = view(
      [scene("top", 20), scene("bottom", 10)],
      [
        element("a", "top", 1, icon()),
        element("b", "bottom", 5, icon()),
        element("c", "top", 0, icon()),
        element("d", "top", 0, icon()),
      ],
    );

    expect(drawnElements(built)).toEqual(["b", "c", "d", "a"]);
  });

  it("leaves out a switched-off scene and every scene under it", () => {
    const built = view(
      [scene("root", 1), scene("child", 2, "root"), scene("other", 3)],
      [
        element("a", "root", 0, icon()),
        element("b", "child", 0, icon()),
        element("c", "other", 0, icon()),
      ],
    );

    const drawn = drawnElements(built, { ...SHOWN, hiddenScenes: new Set(["root"]) });

    expect(drawn).toEqual(["c"]);
  });

  it("draws only the chosen button state's elements", () => {
    const button = element(
      "button",
      "root",
      0,
      {
        kind: "group",
        children: ["idle", "hover"],
        states: [
          { state: "DefaultStateElements", elements: ["idle"], text: null, textFrame: null },
          { state: "HoverStateElements", elements: ["hover"], text: null, textFrame: null },
        ],
        alpha: 1,
        layout: null,
        button: null,
        meter: null,
      },
      null,
    );
    const built = view(
      [scene("root", 1)],
      [button, element("idle", "root", 0, icon()), element("hover", "root", 0, icon())],
    );

    expect(drawnElements(built)).toEqual(["idle"]);
    const hovered = new Map([[button.key, "HoverStateElements"]]);
    expect(drawnElements(built, { ...SHOWN, buttonStates: hovered })).toEqual(["hover"]);
  });

  it("draws a state the file does not write as nothing, and its label with it", () => {
    const button = element(
      "button",
      "root",
      0,
      {
        kind: "group",
        children: ["idle", "label"],
        states: [
          { state: "DefaultStateElements", elements: ["idle"], text: "label", textFrame: null },
        ],
        alpha: 1,
        layout: null,
        button: null,
        meter: null,
      },
      null,
    );
    const built = view(
      [scene("root", 1)],
      [button, element("idle", "root", 0, icon()), element("label", "root", 0, icon())],
    );

    expect(drawnElements(built)).toEqual(["idle", "label"]);
    const clicked = new Map([["button", "ClickedStateElements"]]);
    expect(drawnElements(built, { ...SHOWN, buttonStates: clicked })).toEqual([]);
  });

  it("draws a group below full alpha offscreen between a push and a pop", () => {
    const built = view(
      [scene("root", 1)],
      [
        element("before", "root", 0, icon()),
        group("faded", "root", ["inside"], 0.5),
        element("inside", "root", 3, icon()),
        element("after", "root", 1, icon()),
      ],
    );

    const kinds = commandsOf(built).map((command) =>
      command.kind === "draw" ? command.element : command.kind,
    );

    expect(kinds).toEqual(["before", "push", "inside", "pop", "after"]);
    const pop = commandsOf(built).find((command) => command.kind === "pop");
    expect(pop?.kind === "pop" && pop.alpha).toBe(0.5);
  });

  it("clips a scene to its scissor region and a child scene that inherits it", () => {
    const built = view(
      [scene("root", 1), scene("child", 2, "root")],
      [
        element("clip", "root", 0, { kind: "scissor", scene: "root" }, rect(100, 100, 200, 200)),
        element("a", "child", 0, icon()),
      ],
    );

    const draw = commandsOf(built).find((command) => command.kind === "draw");

    expect(draw?.kind === "draw" && draw.scissor).toEqual({ x: 100, y: 100, w: 200, h: 200 });
  });

  it("draws an icon without alpha opaque, and an icon without a sprite not at all", () => {
    const opaque = { ...icon(), useAlpha: false };
    const bare = { ...icon(), sprite: null };
    const built = view(
      [scene("root", 1)],
      [element("a", "root", 0, opaque), element("b", "root", 0, bare)],
    );

    const commands = commandsOf(built);

    expect(commands).toHaveLength(1);
    expect(commands[0]?.kind === "draw" && commands[0].shader).toBe("opaque");
  });
});

describe("visibleElements", () => {
  it("lists groups and undrawn looks in the draw order, the topmost last", () => {
    const built = view(
      [scene("root", 1)],
      [
        element("region", "root", 2, { kind: "region" }),
        group("group", "root", []),
        element("icon", "root", 1, icon()),
      ],
    );

    expect(visibleElements(buildTree(built), SHOWN)).toEqual(["group", "icon", "region"]);
  });
});

describe("hiding", () => {
  const SPARK = { kind: "particle", system: "0x00000001", scale: 1 } as ViewLook;
  const built = view(
    [scene("root", 0)],
    [
      element("icon", "root", 0, icon()),
      group("box", "root", ["inner"]),
      element("inner", "root", 1, icon()),
      element("spark", "root", 2, SPARK),
    ],
  );

  it("leaves out an element the reader hid and everything a hidden group holds", () => {
    const shown = visibleElements(buildTree(built), { ...SHOWN, hiddenElements: new Set(["box"]) });

    expect(shown.sort()).toEqual(["icon", "spark"]);
  });

  it("leaves out every effect while effects are off", () => {
    const shown = visibleElements(buildTree(built), { ...SHOWN, effects: false });

    expect(shown.sort()).toEqual(["box", "icon", "inner"]);
  });
});
