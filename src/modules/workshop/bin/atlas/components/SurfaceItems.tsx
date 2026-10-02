import { FrameCornersIcon, SquareSplitHorizontalIcon } from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";

import { labelOf } from "../engine/model/layers";
import type { ViewTree } from "../engine/model/tree";
import { useSurfaces } from "../hooks/useSurfaces";

export interface SurfaceItemsProps {
  readonly tree: ViewTree;
  /** The element the menu opened on. */
  readonly target: string;
  readonly selection: readonly string[];
}

/**
 * The surface actions of an image's menu, per section 5 of docs/plans/atlas-ui-editor.md: make a
 * surface from the image it draws and dress that image in it, and dress every selected image in a
 * surface of the project's sheet, each at its own size.
 */
export function SurfaceItems({ tree, target, selection }: SurfaceItemsProps) {
  const surfaces = useSurfaces(tree.view);
  const element = tree.elements.get(target);
  if (!surfaces.available || element?.look.kind !== "icon") return null;

  const images = [...new Set([target, ...selection])].filter(
    (key) => tree.elements.get(key)?.look.kind === "icon",
  );
  const { sprite } = element.look;
  const asset = sprite === null ? null : (tree.view.textures[sprite.texture]?.asset ?? null);

  return (
    <>
      <ContextMenu.Separator />
      {sprite !== null && asset !== null && (
        <ContextMenu.Item
          icon={<FrameCornersIcon />}
          disabled={surfaces.busy}
          onClick={() =>
            void surfaces.make(
              labelOf(element.label, element.path, element.key),
              { kind: "sprite", texture: asset, uv: [...sprite.uv] },
              [target],
            )
          }
        >
          {m.workshop_bin_atlas_surface_make_action()}
        </ContextMenu.Item>
      )}
      {surfaces.surfaces.length > 0 && (
        <ContextMenu.SubmenuRoot>
          <ContextMenu.SubmenuTrigger icon={<SquareSplitHorizontalIcon />}>
            {m.workshop_bin_atlas_surface_apply_label()}
          </ContextMenu.SubmenuTrigger>
          <ContextMenu.SubmenuContent className="max-h-80 w-60 overflow-y-auto">
            {surfaces.surfaces.map((surface) => (
              <ContextMenu.Item
                key={surface.key}
                onClick={() => void surfaces.apply(images, surface)}
              >
                {surface.key}
              </ContextMenu.Item>
            ))}
          </ContextMenu.SubmenuContent>
        </ContextMenu.SubmenuRoot>
      )}
    </>
  );
}
