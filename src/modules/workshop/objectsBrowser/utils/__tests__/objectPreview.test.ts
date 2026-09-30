import { describe, expect, it } from "vitest";

import { classLayout } from "../../../bin/classes/utils/classLayouts";
import { nameHash } from "../../../bin/shared/utils/binHash";
import { drawsAtlas, objectPreviewKind, playsOnHover } from "../objectPreview";
import type { ObjectRowNode } from "../objectTree";

function object(className: string): ObjectRowNode {
  return {
    type: "object",
    id: "Characters/Viego/Skins/Skin43/Materials/Body",
    path: "Characters/Viego/Skins/Skin43/Materials/Body",
    name: "Body",
    objectHash: "0x2a1f3c7d",
    unnamed: false,
    declarations: [
      {
        classHash: nameHash(className),
        class: className,
        asset: { kind: "gameChunk", wad: "Champions/Viego.wad.client", pathHash: "00aa" },
      } as ObjectRowNode["declarations"][number],
    ],
    layers: [],
    count: 0,
    children: [],
  };
}

describe("objectPreviewKind", () => {
  it("draws a material, a skin and a particle system, and nothing else", () => {
    expect(objectPreviewKind(object("StaticMaterialDef"))).toBe("material");
    expect(objectPreviewKind(object("SkinCharacterDataProperties"))).toBe("skin");
    expect(objectPreviewKind(object("VfxSystemDefinitionData"))).toBe("vfx");
    expect(objectPreviewKind(object("UiElementIconData"))).toBe("ui");
    expect(objectPreviewKind(object("CharacterRecord"))).toBeNull();
  });

  it("draws a loadable's view and a font, and never a map", () => {
    expect(objectPreviewKind(object("UiPropertyLoadable"))).toBe("view");
    expect(objectPreviewKind(object("GameFontDescription"))).toBe("font");
    expect(objectPreviewKind(object("MapContainer"))).toBeNull();
  });

  it("draws a class through the layout it takes from its base", () => {
    const inherited = new Map([
      [nameHash("HudViewController"), classLayout("", [nameHash("ViewController")])!],
      [nameHash("UiElementTextData"), classLayout("", [nameHash("UiElementIData")])!],
    ]);

    expect(objectPreviewKind(object("HudViewController"))).toBeNull();
    expect(objectPreviewKind(object("HudViewController"), inherited)).toBe("view");
    expect(objectPreviewKind(object("UiElementTextData"), inherited)).toBe("element");
  });
});

describe("playsOnHover", () => {
  it("plays every kind with a preview on hover, a character on its turntable", () => {
    expect(playsOnHover("material")).toBe(true);
    expect(playsOnHover("vfx")).toBe(true);
    expect(playsOnHover("skin")).toBe(true);
    expect(playsOnHover("ui")).toBe(false);
    expect(playsOnHover(null)).toBe(false);
  });

  it("plays a view and an element for their effects, and holds a font still", () => {
    expect(playsOnHover("view")).toBe(true);
    expect(playsOnHover("element")).toBe(true);
    expect(playsOnHover("font")).toBe(false);
  });
});

describe("drawsAtlas", () => {
  it("draws the UI kinds through the Atlas renderer and nothing else", () => {
    expect(drawsAtlas("view")).toBe(true);
    expect(drawsAtlas("element")).toBe(true);
    expect(drawsAtlas("font")).toBe(true);
    expect(drawsAtlas("ui")).toBe(false);
    expect(drawsAtlas("vfx")).toBe(false);
  });
});
