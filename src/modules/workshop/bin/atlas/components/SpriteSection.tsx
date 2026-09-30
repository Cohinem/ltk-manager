import { ImageSquareIcon } from "@phosphor-icons/react";

import { Button } from "@/components";
import { m } from "@/i18n";
import type { SheetSpec } from "@/lib/tauri";

import { sheetSpriteAt } from "../engine/edit/spriteEdits";
import { spriteId } from "../engine/model/sprites";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement, ViewSprite } from "../engine/model/view";
import { useSpriteImport } from "../hooks/useSpriteImport";
import { SectionBlock } from "./sectionParts";
import { SpriteThumb } from "./SpriteThumb";

type ViewTexture = ViewTree["view"]["textures"][number];

/** The sprite's preview, in CSS pixels. */
const PREVIEW_SIZE = 64;

export interface SpriteSectionProps {
  readonly element: ViewElement;
  readonly tree: ViewTree;
}

/**
 * The sprite an icon or effect element draws, and the way to draw another: the picked PNG joins
 * the sheet the project owns for the view and the element points at it, per section 5 of
 * docs/plans/atlas-ui-editor.md. A sprite of that sheet no other element draws is replaced where
 * it stands.
 */
export function SpriteSection({ element, tree }: SpriteSectionProps) {
  const sprites = useSpriteImport(tree.view);
  const { look } = element;
  const sprite = look.kind === "icon" || look.kind === "effect" ? look.sprite : null;
  if (sprite === null) return null;

  const texture = tree.view.textures[sprite.texture];
  const flip = look.kind === "icon" || look.kind === "effect" ? look.flip : undefined;
  const replace = texture === undefined ? null : soleKey(tree, sprite, texture, sprites.sheet);
  const full = sprite.name ?? texture?.path;

  return (
    <SectionBlock id="sprite" title={m.workshop_bin_atlas_sprite_section_title()}>
      <div className="col-span-2 flex items-center gap-3">
        {texture?.asset != null && (
          <SpriteThumb
            asset={texture.asset}
            uv={sprite.uv}
            flip={flip}
            size={PREVIEW_SIZE}
            className="rounded-sm bg-surface-950/40"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate font-mono text-meta text-surface-300 select-text" title={full}>
            {full?.slice(full.lastIndexOf("/") + 1)}
          </span>
          {sprites.available && (
            <Button
              variant="outline"
              size="xs"
              className="self-start"
              disabled={sprites.importing}
              left={<ImageSquareIcon weight="bold" className="h-3.5 w-3.5" />}
              onClick={() => void sprites.run([element.key], replace)}
            >
              {m.workshop_bin_atlas_sprites_replace_action()}
            </Button>
          )}
        </div>
      </div>
    </SectionBlock>
  );
}

/** The sheet sprite `sprite` is, where it sits on the project's sheet and one element alone draws it. */
function soleKey(
  tree: ViewTree,
  sprite: ViewSprite,
  texture: ViewTexture,
  sheet: SheetSpec | null,
): string | null {
  if (sheet === null || texture.asset?.kind !== "layer") return null;
  if (texture.path.toLowerCase() !== sheet.path.toLowerCase()) return null;

  const id = spriteId(sprite);
  const sharers = tree.view.elements.filter(
    (each) =>
      (each.look.kind === "icon" || each.look.kind === "effect") &&
      each.look.sprite !== null &&
      spriteId(each.look.sprite) === id,
  );
  return sharers.length === 1 ? (sheetSpriteAt(sheet, sprite.uv)?.key ?? null) : null;
}
