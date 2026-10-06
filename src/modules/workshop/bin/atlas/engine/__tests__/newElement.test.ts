import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import { addTargetOf, newElementEdits, newElementName, placeAt } from "../edit/newElement";
import { ELEMENT_KINDS, type ElementKind, matchingKinds } from "../model/elementKinds";
import { buildTree } from "../model/tree";
import type { ViewLook } from "../model/view";
import { element, icon, rect, scene, view } from "./fixtures";

const FOLDER = "Mods/test/";

function group(children: string[]): ViewLook {
  return {
    kind: "group",
    children,
    states: [],
    alpha: 1,
    layout: null,
    button: null,
    meter: null,
  } as ViewLook;
}

function kindOf(className: string): ElementKind {
  const kind = ELEMENT_KINDS.find((each) => each.class === className);
  if (kind === undefined) throw new Error(`no kind for ${className}`);
  return kind;
}

const IMAGE = kindOf("UiElementIconData");
const GROUP = kindOf("UiElementGroupData");

function hud() {
  return buildTree(
    view(
      [scene("hud", 1), scene("shop", 0)],
      [
        element("portrait", "hud", 4, icon(), rect(0, 0, 64, 64, { source: [1334, 750] })),
        element("frame", "hud", 7, icon(), rect(0, 0, 64, 64, { source: [1334, 750] })),
        element("row", "shop", 0, group(["cell"]), null),
        element("cell", "shop", 2, icon()),
      ],
    ),
  );
}

describe("addTargetOf", () => {
  it("lands in the first root scene with nothing selected", () => {
    expect(addTargetOf(hud(), null)).toEqual({ scene: "hud", group: null });
  });

  it("lands in the scene a selected element draws in", () => {
    expect(addTargetOf(hud(), "cell")).toEqual({ scene: "shop", group: null });
  });

  it("lands inside a selected group", () => {
    expect(addTargetOf(hud(), "row")).toEqual({ scene: "shop", group: "row" });
  });

  it("finds no target in a view without a scene", () => {
    expect(addTargetOf(buildTree(view([], [])), null)).toBeNull();
  });
});

describe("newElementName", () => {
  it("names the element by the mod folder, its scene and its kind", () => {
    expect(newElementName(hud(), FOLDER, { scene: "hud", group: null }, IMAGE)).toBe(
      "Mods/test/hud/Image",
    );
  });

  it("numbers a name the view already holds", () => {
    const taken = [nameHash("Mods/test/hud/Image"), nameHash("Mods/test/hud/Image2")];
    const tree = buildTree(
      view(
        [scene("hud", 0)],
        taken.map((key) => element(key, "hud", 0, icon())),
      ),
    );

    expect(newElementName(tree, FOLDER, { scene: "hud", group: null }, IMAGE)).toBe(
      "Mods/test/hud/Image3",
    );
  });
});

describe("newElementEdits", () => {
  it("centres a rect in its siblings' source resolution, enabled on the layer above them", () => {
    const edits = newElementEdits(hud(), "new", "Mods/test/hud/Image", IMAGE, {
      scene: "hud",
      group: null,
    });
    const leaves = edits.flatMap((edit) =>
      edit.edits.flatMap((each) => (each.type === "setLeaf" ? [each.value] : [])),
    );

    expect(edits.every((edit) => edit.entry === "new")).toBe(true);
    expect(leaves).toEqual([
      { type: "string", value: "Mods/test/hud/Image" },
      { type: "objectLink", text: "hud" },
      { type: "bool", value: true },
      { type: "integer", text: "8" },
      { type: "vector", values: [603, 311] },
      { type: "vector", values: [128, 128] },
      { type: "integer", text: "1334" },
      { type: "integer", text: "750" },
      { type: "vector", values: [0.5, 0.5] },
    ]);
  });

  it("gives a rect its class before any field of it", () => {
    const edits = newElementEdits(hud(), "new", "n", IMAGE, { scene: "hud", group: null });
    const position = edits.find((edit) => edit.field === nameHash("Position"));

    expect(position?.edits[0]).toEqual({
      type: "replacePointer",
      path: "",
      class: "UiPositionRect",
    });
  });

  it("writes a group no rect, layer or switch", () => {
    const edits = newElementEdits(hud(), "new", "n", GROUP, { scene: "hud", group: null });

    expect(edits.map((edit) => edit.field)).toEqual([nameHash("name"), nameHash("Scene")]);
  });

  it("lists the element last in the group it lands in, above the group's children", () => {
    const edits = newElementEdits(hud(), "new", "n", IMAGE, { scene: "shop", group: "row" });
    const listed = edits.find((edit) => edit.entry === "row");
    const layer = edits.find((edit) => edit.field === nameHash("Layer"));

    expect(listed?.edits).toEqual([
      { type: "insertItem", path: "", item: { index: 1, key: null, class: null } },
      { type: "setLeaf", path: "[1]", value: { type: "objectLink", text: "new" } },
    ]);
    expect(layer?.edits).toEqual([
      { type: "setLeaf", path: "", value: { type: "integer", text: "3" } },
    ]);
  });

  it("falls back to the desktop HUD's resolution in a view with no rect", () => {
    const tree = buildTree(view([scene("hud", 0)], []));
    const edits = newElementEdits(tree, "new", "n", IMAGE, { scene: "hud", group: null });
    const vectors = edits.flatMap((edit) =>
      edit.edits.flatMap((each) =>
        each.type === "setLeaf" && each.value.type === "vector" ? [each.value.values] : [],
      ),
    );

    expect(vectors[0]).toEqual([736, 536]);
  });
});

describe("placeAt", () => {
  const settings = {
    screen: { width: 2560, height: 1080 },
    hud: 0.8,
    safeZone: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
  };

  it("draws the new rect centred on the point, whatever the screen, HUD scale and safe zone", () => {
    const place = placeAt(hud(), IMAGE, "hud", settings, [1900, 300]);
    const rect = place?.rect ?? { x: 0, y: 0, w: 0, h: 0 };

    expect(place?.position.every(Number.isInteger)).toBe(true);
    expect(Math.abs(rect.x + rect.w / 2 - 1900)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(rect.y + rect.h / 2 - 300)).toBeLessThanOrEqual(1.5);
  });

  it("writes the position it answers", () => {
    const place = placeAt(hud(), IMAGE, "hud", settings, [1900, 300]);
    const edits = newElementEdits(
      hud(),
      "new",
      "n",
      IMAGE,
      { scene: "hud", group: null },
      place?.position,
    );
    const [corner] = edits.flatMap((edit) =>
      edit.edits.flatMap((each) =>
        each.type === "setLeaf" && each.value.type === "vector" ? [each.value.values] : [],
      ),
    );

    expect(corner).toEqual(place?.position);
  });

  it("answers no place for a kind that draws from no rect", () => {
    expect(placeAt(hud(), GROUP, "hud", settings, [1900, 300])).toBeNull();
  });
});

describe("matchingKinds", () => {
  it("lists every kind for a blank search", () => {
    expect(matchingKinds("  ")).toBe(ELEMENT_KINDS);
  });

  it("finds a kind by its alias and by its class, ignoring case", () => {
    expect(matchingKinds("image").map((kind) => kind.name)).toContain("Image");
    expect(matchingKinds("SCISSOR").map((kind) => kind.name)).toEqual(["ClipRegion"]);
  });

  it("gives every kind a class of its own", () => {
    expect(new Set(ELEMENT_KINDS.map((kind) => kind.class)).size).toBe(ELEMENT_KINDS.length);
  });
});
