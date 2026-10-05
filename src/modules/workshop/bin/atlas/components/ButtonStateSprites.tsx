import { ExportIcon, ImageSquareIcon } from "@phosphor-icons/react";

import { IconButton } from "@/components";
import { m } from "@/i18n";

import { BUTTON_STATES } from "../engine/model/buttons";
import { labelOf } from "../engine/model/layers";
import { exportedSprite } from "../engine/model/sprites";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { useSpriteExport } from "../hooks/useSpriteExport";
import { pageOf, useSpriteImport } from "../hooks/useSpriteImport";
import { soleKey } from "./SpriteSection";
import { SpriteThumb } from "./SpriteThumb";

/** A state's thumbnail, in CSS pixels. */
const THUMB_SIZE = 28;

type ButtonState = Extract<ViewElement["look"], { kind: "group" }>["states"][number];

export interface ButtonStateSpritesProps {
  readonly tree: ViewTree;
  readonly states: readonly ButtonState[];
}

/**
 * Each state a button writes, in the client's order, with the sprite its elements draw and the
 * actions that replace or export it, so a state's image changes without selecting the element that
 * draws it. A state whose elements draw no sprite lists its name alone.
 */
export function ButtonStateSprites({ tree, states }: ButtonStateSpritesProps) {
  const written = BUTTON_STATES.flatMap((name) => states.filter((state) => state.state === name));
  if (written.length === 0) {
    return (
      <p className="col-span-2 text-meta text-surface-500">
        {m.workshop_bin_atlas_button_no_states_value()}
      </p>
    );
  }

  return (
    <div data-ui="ButtonStateSprites" className="col-span-2 flex flex-col gap-1">
      {written.map((state) => (
        <StateRow key={state.state} tree={tree} state={state} />
      ))}
    </div>
  );
}

function StateRow({ tree, state }: { tree: ViewTree; state: ButtonState }) {
  const sprites = useSpriteImport(tree.view);
  const exports = useSpriteExport();
  const key = state.elements.find((each) => spriteOf(tree.elements.get(each)) !== null) ?? null;
  const element = key === null ? undefined : tree.elements.get(key);
  const drawn = spriteOf(element);
  const texture = drawn === null ? undefined : tree.view.textures[drawn.sprite.texture];
  const exported = key === null ? null : exportedSprite(tree, key);
  const name = stateName(state.state);

  return (
    <div className="group/state flex h-8 items-center gap-2 text-meta">
      <span className="w-24 shrink-0 truncate text-surface-400 select-none">{name}</span>
      {texture?.asset != null && drawn !== null && (
        <SpriteThumb
          asset={texture.asset}
          uv={drawn.sprite.uv}
          flip={drawn.flip}
          size={THUMB_SIZE}
          className="shrink-0 rounded-sm bg-surface-950/40"
        />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-surface-300 select-text">
        {element === undefined ? "" : labelOf(element.label, element.path, element.key)}
      </span>
      {key !== null && drawn !== null && texture !== undefined && sprites.available && (
        <IconButton
          aria-label={m.workshop_bin_atlas_button_state_replace_label({ state: name })}
          disabled={sprites.importing}
          icon={<ImageSquareIcon />}
          onClick={() =>
            void sprites.run(
              [key],
              soleKey(tree, drawn.sprite, texture, sprites.sheet),
              pageOf(texture.path, drawn.sprite.uv, sprites.sheet),
            )
          }
          tooltip={m.workshop_bin_atlas_sprites_replace_action()}
        />
      )}
      {exported !== null && (
        <IconButton
          aria-label={m.workshop_bin_atlas_button_state_export_label({ state: name })}
          disabled={exports.exporting}
          icon={<ExportIcon />}
          onClick={() => void exports.run(exported)}
          tooltip={m.workshop_bin_atlas_sprites_export_action()}
        />
      )}
    </div>
  );
}

/** The sprite an icon or effect element draws and how it flips, none for another element. */
function spriteOf(element: ViewElement | undefined) {
  const look = element?.look;
  if ((look?.kind !== "icon" && look?.kind !== "effect") || look.sprite === null) return null;
  return { sprite: look.sprite, flip: look.flip };
}

/** A state's short name, as the toolbar's state menu names it. */
function stateName(state: string): string {
  switch (state) {
    case "DefaultStateElements":
      return m.workshop_bin_atlas_state_default_label();
    case "HoverStateElements":
      return m.workshop_bin_atlas_state_hover_label();
    case "ClickedStateElements":
      return m.workshop_bin_atlas_state_clicked_label();
    case "SelectedStateElements":
      return m.workshop_bin_atlas_state_selected_label();
    case "SelectedHoverStateElements":
      return m.workshop_bin_atlas_state_selected_hover_label();
    case "SelectedClickedStateElements":
      return m.workshop_bin_atlas_state_selected_clicked_label();
    case "InactiveStateElements":
      return m.workshop_bin_atlas_state_inactive_label();
    case "InactiveSelectedStateElements":
      return m.workshop_bin_atlas_state_inactive_selected_label();
    default:
      return state;
  }
}
