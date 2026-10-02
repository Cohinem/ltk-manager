import { Select } from "@/components";
import { m } from "@/i18n";
import type { SheetSpec } from "@/lib/tauri";

import { sheetSpriteAt } from "../engine/edit/spriteEdits";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { useSurfaces } from "../hooks/useSurfaces";
import { FieldLine } from "./sectionParts";

export interface SurfaceFieldProps {
  readonly element: ViewElement;
  readonly tree: ViewTree;
  /** The project's sheet for the view, which the element's surface sits on. */
  readonly sheet: SheetSpec | null;
}

/**
 * The surface an image wears, and the list that dresses it in another, per section 5 of
 * docs/plans/atlas-ui-editor.md. A project with no surface yet points at the image menu that makes
 * one.
 */
export function SurfaceField({ element, tree, sheet }: SurfaceFieldProps) {
  const surfaces = useSurfaces(tree.view);
  if (!surfaces.available || element.look.kind !== "icon") return null;

  const label = m.workshop_bin_atlas_surface_label();
  if (surfaces.surfaces.length === 0) {
    return (
      <FieldLine label={label}>
        <span className="min-w-0 truncate text-surface-500">
          {m.workshop_bin_atlas_surface_none_hint()}
        </span>
      </FieldLine>
    );
  }

  const worn = wornSurface(element, tree, sheet);
  return (
    <FieldLine label={label}>
      <Select.Root
        value={worn ?? ""}
        disabled={surfaces.busy}
        onValueChange={(key) => {
          const surface = surfaces.surfaces.find((each) => each.key === key);
          if (surface !== undefined) void surfaces.apply([element.key], surface);
        }}
      >
        <Select.Trigger aria-label={label} className="h-7 min-w-0 flex-1 gap-1 px-2 text-meta">
          <Select.Value className="truncate">
            {(key: string) => key || m.workshop_bin_atlas_surface_pick_placeholder()}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Content className="max-h-80">
          {surfaces.surfaces.map((surface) => (
            <Select.Item key={surface.key} value={surface.key}>
              {surface.key}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </FieldLine>
  );
}

/** The surface of the project's sheet the image draws, none for any other sprite. */
function wornSurface(element: ViewElement, tree: ViewTree, sheet: SheetSpec | null): string | null {
  const { look } = element;
  if (look.kind !== "icon" || look.sprite === null || sheet === null) return null;

  const texture = tree.view.textures[look.sprite.texture];
  if (texture?.path.toLowerCase() !== sheet.path.toLowerCase()) return null;

  const held = sheetSpriteAt(sheet, look.sprite.uv);
  return held?.slice === null || held === null ? null : held.key;
}
