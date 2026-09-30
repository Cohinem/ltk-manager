import { describe, expect, it } from "vitest";

import type { SheetSpec } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { sheetNameOf, sheetSpriteAt, sheetSpriteEdits } from "../edit/spriteEdits";
import {
  exportedSprite,
  iconThumb,
  spriteFileName,
  spriteRows,
  spriteTextures,
} from "../model/sprites";
import { buildTree } from "../model/tree";
import type { View, ViewElement, ViewLook } from "../model/view";
import { element, icon, scene, view } from "./fixtures";

const SHEET: SheetSpec = {
  path: "assets/ux/mymod/hud.tex",
  layer: "base",
  archive: "UI.wad.client",
  width: 64,
  height: 32,
  sprites: [
    { key: "frame", x: 2, y: 2, width: 20, height: 10 },
    { key: "gem", x: 26, y: 2, width: 8, height: 8 },
  ],
};

function withSprite(uv: [number, number, number, number], texture = 0): ViewLook {
  const look = icon(texture);
  if (look.kind !== "icon" || look.sprite === null) throw new Error("icon has a sprite");
  return { ...look, sprite: { ...look.sprite, uv } };
}

function twoTextures(elements: ViewElement[]): View {
  return {
    ...view([scene("s", 0)], elements),
    textures: [
      { path: "sheet.tex", asset: { kind: "file", path: "sheet.tex" }, page: false },
      { path: "page", asset: { kind: "file", path: "page" }, page: true },
    ],
  };
}

describe("spriteTextures", () => {
  it("lists each texture's sprites once with every element drawing them, pages first", () => {
    const built = twoTextures([
      element("a", "s", 0, withSprite([0, 0, 0.5, 0.5])),
      element("b", "s", 1, withSprite([0, 0, 0.5, 0.5])),
      element("c", "s", 2, withSprite([0.5, 0, 1, 0.5])),
      element("d", "s", 3, withSprite([0, 0, 1, 1], 1)),
    ]);

    const textures = spriteTextures(built);

    expect(textures.map((texture) => texture.path)).toEqual(["page", "sheet.tex"]);
    expect(textures[1]?.sprites.map((sprite) => sprite.elements)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("spriteRows", () => {
  const tree = () =>
    buildTree(
      twoTextures([
        element("gem", "s", 0, withSprite([0, 0, 0.5, 0.5])),
        element("frame", "s", 1, withSprite([0.5, 0, 1, 0.5])),
        element("glow", "s", 2, withSprite([0, 0, 1, 1], 1)),
      ]),
    );

  it("heads each texture's sprites and names a sprite by the first element drawing it", () => {
    const built = tree();
    const rows = spriteRows(built, spriteTextures(built.view), "");

    expect(rows.map((row) => (row.type === "texture" ? row.texture.path : row.label))).toEqual([
      "page",
      "glow",
      "sheet.tex",
      "gem",
      "frame",
    ]);
  });

  it("keeps the sprites a search finds, and every sprite of a texture whose path it finds", () => {
    const built = tree();
    const textures = spriteTextures(built.view);

    const byName = spriteRows(built, textures, "FRA");
    expect(byName.map((row) => row.id)).toEqual(["texture:0", byName[1]?.id]);
    expect(byName[0]?.type === "texture" && byName[0].shown).toBe(1);

    const byPath = spriteRows(built, textures, "sheet");
    expect(byPath.filter((row) => row.type === "sprite")).toHaveLength(2);
  });
});

describe("iconThumb", () => {
  it("crops an icon's sprite from its texture and passes by any other element", () => {
    const tree = buildTree(
      twoTextures([
        element("a", "s", 0, withSprite([0, 0, 0.5, 0.5])),
        element("t", "s", 1, { kind: "region" }),
      ]),
    );

    expect(iconThumb(tree, "a")).toEqual({
      asset: { kind: "file", path: "sheet.tex" },
      uv: [0, 0, 0.5, 0.5],
      flip: [false, false],
    });
    expect(iconThumb(tree, "t")).toBeNull();
  });
});

describe("sheetSpriteEdits", () => {
  it("points each element at the sheet sprite through an AtlasData of its rect and the page's size", () => {
    const [edit] = sheetSpriteEdits(["0x00000010"], SHEET, SHEET.sprites[1]!);

    expect(edit?.field).toBe(nameHash("TextureData"));
    expect(edit?.edits[0]).toEqual({ type: "replacePointer", path: "", class: "AtlasData" });
    expect(edit?.edits).toContainEqual({
      type: "setLeaf",
      path: nameHash("mTextureUV").slice(2),
      value: { type: "vector", values: [26, 2, 34, 10] },
    });
    expect(edit?.edits).toContainEqual({
      type: "setLeaf",
      path: nameHash("mTextureName").slice(2),
      value: { type: "wadChunkLink", text: SHEET.path },
    });
  });
});

describe("sheetSpriteAt", () => {
  it("finds the sheet sprite a drawn rect is, within half a pixel", () => {
    expect(sheetSpriteAt(SHEET, [26 / 64, 2 / 32, 34 / 64, 10 / 32])?.key).toBe("gem");
    expect(sheetSpriteAt(SHEET, [0, 0, 1, 1])).toBeNull();
  });

  it("names a view's sheet for the view", () => {
    expect(sheetNameOf({ name: "ClientStates/Gameplay/UX/Hud", entry: "0x1" })).toBe("Hud");
    expect(sheetNameOf({ name: null, entry: "0x1" })).toBe("0x1");
  });
});

describe("exportedSprite", () => {
  it("exports an element's sprite from its page under the element's label", () => {
    const tree = buildTree(
      twoTextures([
        element("gem", "s", 0, withSprite([0.25, 0, 0.5, 0.5])),
        element("blank", "s", 1, {
          ...(icon(0) as Extract<ViewLook, { kind: "icon" }>),
          sprite: null,
        }),
      ]),
    );

    expect(exportedSprite(tree, "gem")).toEqual({
      asset: { kind: "file", path: "sheet.tex" },
      uv: [0.25, 0, 0.5, 0.5],
      label: "gem",
    });
    expect(exportedSprite(tree, "blank")).toBeNull();
    expect(exportedSprite(tree, "missing")).toBeNull();
  });

  it("names the file for the label, with no image extension and nothing a path rejects", () => {
    expect(spriteFileName("gem")).toBe("gem.png");
    expect(spriteFileName("icon_gold.TEX")).toBe("icon_gold.png");
    expect(spriteFileName('a/b:c*"d')).toBe("a_b_c__d.png");
    expect(spriteFileName("")).toBe("sprite.png");
  });
});
