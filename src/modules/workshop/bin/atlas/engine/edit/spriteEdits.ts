import type { LeafValue, PropertyEdit, SheetSpec, SheetSprite, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";

const TEXTURE_DATA = nameHash("TextureData");
const ATLAS_DATA = "AtlasData";
const ATLAS_NINE_SLICE = "AtlasData9Slice";
const TEXTURE_NAME = nameHash("mTextureName");
const TEXTURE_UV = nameHash("mTextureUV");
const SOURCE_WIDTH = nameHash("mTextureSourceResolutionWidth");
const SOURCE_HEIGHT = nameHash("mTextureSourceResolutionHeight");
const TEXTURE_US = nameHash("TextureUs");
const TEXTURE_VS = nameHash("TextureVs");
const LEFT_RIGHT_WIDTHS = nameHash("LeftRightWidths");
const TOP_BOTTOM_HEIGHTS = nameHash("TopBottomHeights");

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
  return textureEdits(keys, ATLAS_DATA, [
    ...pageLeaves(sheet),
    [TEXTURE_UV, { type: "vector", values: rect }],
  ]);
}

/**
 * The edits that dress every element of `keys` in the surface `sprite` of `sheet`: its
 * `TextureData` becomes an `AtlasData9Slice` whose corners and edges draw at their own size and
 * whose middle stretches to the element, per section 5 of docs/plans/atlas-ui-editor.md. A sprite
 * with no slice insets stretches whole.
 */
export function surfaceEdits(
  keys: readonly string[],
  sheet: SheetSpec,
  sprite: SheetSprite,
): PropertyEdit[] {
  const [left, right, top, bottom] = sprite.slice ?? [0, 0, 0, 0];
  const { x, y, width, height } = sprite;
  return textureEdits(keys, ATLAS_NINE_SLICE, [
    ...pageLeaves(sheet),
    [TEXTURE_US, { type: "vector", values: [x, x + left, x + width - right, x + width] }],
    [TEXTURE_VS, { type: "vector", values: [y, y + top, y + height - bottom, y + height] }],
    [LEFT_RIGHT_WIDTHS, { type: "vector", values: [left, right] }],
    [TOP_BOTTOM_HEIGHTS, { type: "vector", values: [top, bottom] }],
  ]);
}

/** The page a sheet sprite sits on and the size its rects are measured against. */
function pageLeaves(sheet: SheetSpec): [string, LeafValue][] {
  return [
    [TEXTURE_NAME, { type: "wadChunkLink", text: sheet.path }],
    [SOURCE_WIDTH, { type: "integer", text: String(sheet.width) }],
    [SOURCE_HEIGHT, { type: "integer", text: String(sheet.height) }],
  ];
}

/** `TextureData` of every element of `keys` replaced by a `pointer` of class `class` with `leaves`. */
function textureEdits(
  keys: readonly string[],
  pointer: string,
  leaves: readonly [string, LeafValue][],
): PropertyEdit[] {
  const edits: ValueEdit[] = [
    { type: "replacePointer", path: "", class: pointer },
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
