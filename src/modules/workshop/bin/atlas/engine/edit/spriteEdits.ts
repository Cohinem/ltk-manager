import type { LeafValue, PropertyEdit, SheetSpec, SheetSprite, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";

const TEXTURE_DATA = nameHash("TextureData");
const ATLAS_DATA = "AtlasData";
const TEXTURE_NAME = nameHash("mTextureName");
const TEXTURE_UV = nameHash("mTextureUV");
const SOURCE_WIDTH = nameHash("mTextureSourceResolutionWidth");
const SOURCE_HEIGHT = nameHash("mTextureSourceResolutionHeight");

/** How far a drawn rect may sit from a sheet sprite's and still be it, in pixels. */
const SAME_RECT = 0.5;

/**
 * The edits that point every element of `keys` at `sprite` of `sheet`: its `TextureData` becomes an
 * `AtlasData` naming the page, the sprite's pixel rect and the page's size, per section 5 of
 * docs/plans/atlas-ui-editor.md.
 */
export function sheetSpriteEdits(
  keys: readonly string[],
  sheet: SheetSpec,
  sprite: SheetSprite,
): PropertyEdit[] {
  const rect = [sprite.x, sprite.y, sprite.x + sprite.width, sprite.y + sprite.height];
  const leaves: [string, LeafValue][] = [
    [TEXTURE_NAME, { type: "wadChunkLink", text: sheet.path }],
    [TEXTURE_UV, { type: "vector", values: rect }],
    [SOURCE_WIDTH, { type: "integer", text: String(sheet.width) }],
    [SOURCE_HEIGHT, { type: "integer", text: String(sheet.height) }],
  ];
  const edits: ValueEdit[] = [
    { type: "replacePointer", path: "", class: ATLAS_DATA },
    ...leaves.flatMap(([field, value]): ValueEdit[] => [
      { type: "ensureProperty", path: "", field },
      { type: "setLeaf", path: field.slice(2), value },
    ]),
  ];

  return keys.map((entry) => ({ entry, holder: "", field: TEXTURE_DATA, edits }));
}

/** The sprite of `sheet` a sprite drawn at `uv` of that sheet's page is, none where no rect fits. */
export function sheetSpriteAt(
  sheet: SheetSpec,
  uv: readonly [number, number, number, number],
): SheetSprite | null {
  const [u0, v0, u1, v1] = uv;
  const drawn = [u0 * sheet.width, v0 * sheet.height, u1 * sheet.width, v1 * sheet.height];
  return (
    sheet.sprites.find((sprite) => {
      const rect = [sprite.x, sprite.y, sprite.x + sprite.width, sprite.y + sprite.height];
      return rect.every((edge, at) => Math.abs(edge - (drawn[at] ?? 0)) <= SAME_RECT);
    }) ?? null
  );
}

/** The sheet a view's imported images go to, named for the view. */
export function sheetNameOf(view: {
  readonly name: string | null;
  readonly entry: string;
}): string {
  return view.name?.split("/").at(-1) ?? view.entry;
}
