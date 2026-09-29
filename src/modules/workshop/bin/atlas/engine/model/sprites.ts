import type { AssetRef } from "@/lib/tauri";

import { labelOf } from "./layers";
import type { ViewTree } from "./tree";
import type { View, ViewSprite } from "./view";

type Uv = readonly [number, number, number, number];

/** The sprite an icon element draws, as a thumbnail crops it. */
export interface IconThumb {
  readonly asset: AssetRef;
  readonly uv: Uv;
  readonly flip: readonly [boolean, boolean];
}

/** The sprite the icon element `key` draws, none for another element or one it cannot reach. */
export function iconThumb(tree: ViewTree, key: string): IconThumb | null {
  const element = tree.elements.get(key);
  if (element?.look.kind !== "icon" || element.look.sprite === null) return null;

  const { sprite, flip } = element.look;
  const asset = tree.view.textures[sprite.texture]?.asset ?? null;
  return asset === null ? null : { asset, uv: sprite.uv, flip };
}

/** One sprite a view draws: a rect of one texture, and every element drawing it. */
export interface SpriteUse {
  /** The texture's index and the rect, which tell two sprites apart. */
  readonly id: string;
  readonly texture: number;
  readonly uv: Uv;
  /** The source name a manifest entry has, where the hash tables know it. */
  readonly name: string | null;
  /** The element keys that draw it, in file order. */
  readonly elements: readonly string[];
}

/** One texture a view's sprites sit on, with its sprites in the order they are first drawn. */
export interface SpriteTexture {
  readonly texture: number;
  readonly path: string;
  readonly asset: AssetRef | null;
  /** An auto-atlas page rather than a sheet the elements name by rect. */
  readonly page: boolean;
  /** A texture the project's own layers hold. */
  readonly owned: boolean;
  readonly sprites: readonly SpriteUse[];
}

/** Every texture `view` draws sprites from, pages first, and the sprites on each. */
export function spriteTextures(view: View): SpriteTexture[] {
  const uses = new Map<string, { sprite: ViewSprite; elements: string[] }>();
  for (const element of view.elements) {
    const { look } = element;
    if ((look.kind !== "icon" && look.kind !== "effect") || look.sprite === null) continue;

    const id = spriteId(look.sprite);
    const held = uses.get(id);
    if (held === undefined) uses.set(id, { sprite: look.sprite, elements: [element.key] });
    else held.elements.push(element.key);
  }

  const byTexture = new Map<number, SpriteUse[]>();
  for (const [id, { sprite, elements }] of uses) {
    const use: SpriteUse = {
      id,
      texture: sprite.texture,
      uv: sprite.uv,
      name: sprite.name,
      elements,
    };
    const list = byTexture.get(sprite.texture);
    if (list === undefined) byTexture.set(sprite.texture, [use]);
    else list.push(use);
  }

  return [...byTexture]
    .flatMap(([texture, sprites]) => {
      const held = view.textures[texture];
      if (held === undefined) return [];
      return [
        {
          texture,
          path: held.path,
          asset: held.asset,
          page: held.page,
          owned: held.asset?.kind === "layer",
          sprites,
        },
      ];
    })
    .sort((a, b) => Number(b.page) - Number(a.page) || a.path.localeCompare(b.path));
}

/** A sprite's identity: its texture and its rect to a thousandth of a texel's share. */
export function spriteId(sprite: Pick<ViewSprite, "texture" | "uv">): string {
  return `${sprite.texture}:${sprite.uv.map((edge) => edge.toFixed(5)).join(",")}`;
}

/** One row of the sprites pane: a texture's heading, or one sprite on it. */
export type SpriteRow =
  | {
      readonly type: "texture";
      readonly id: string;
      readonly texture: SpriteTexture;
      /** How many of its sprites the search keeps. */
      readonly shown: number;
    }
  | {
      readonly type: "sprite";
      readonly id: string;
      readonly texture: SpriteTexture;
      readonly sprite: SpriteUse;
      /** The last segment of its source name, else the name of the first element drawing it. */
      readonly label: string;
    };

/**
 * The sprites pane's rows: each texture, then its sprites. A search keeps the sprites whose label
 * or source name holds `query` ignoring case, and every sprite of a texture whose path holds it.
 */
export function spriteRows(
  tree: ViewTree,
  textures: readonly SpriteTexture[],
  query: string,
): SpriteRow[] {
  const needle = query.trim().toLowerCase();
  const holds = (text: string | null) => text !== null && text.toLowerCase().includes(needle);
  const rows: SpriteRow[] = [];

  for (const texture of textures) {
    const whole = needle === "" || holds(texture.path);
    const kept = texture.sprites.flatMap((sprite) => {
      const label = spriteLabel(tree, sprite);
      if (!whole && !holds(label) && !holds(sprite.name)) return [];
      return [{ type: "sprite" as const, id: `sprite:${sprite.id}`, texture, sprite, label }];
    });
    if (kept.length === 0) continue;

    rows.push({ type: "texture", id: `texture:${texture.texture}`, texture, shown: kept.length });
    rows.push(...kept);
  }
  return rows;
}

function spriteLabel(tree: ViewTree, sprite: SpriteUse): string {
  const named = sprite.name?.split("/").at(-1);
  if (named !== undefined) return named;

  const first = tree.elements.get(sprite.elements[0] ?? "");
  return first === undefined ? sprite.id : labelOf(first.label, first.path, first.key);
}
