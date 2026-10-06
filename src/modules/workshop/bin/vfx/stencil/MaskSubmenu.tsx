import { ProhibitIcon, SelectionAllIcon, SelectionPlusIcon } from "@phosphor-icons/react";
import { use } from "react";

import { Menu } from "@/components";
import { m } from "@/i18n";

import { STENCIL_MODE } from "../engine/model/enums";
import { useEmitterModel } from "../inspector/state/emitterModel";
import { VfxRunContext } from "../playback/state/run";
import { freeName } from "../templates/templateEdits";
import { freeReference, maskUse } from "./maskModel";
import { maskLabel, writersLine } from "./maskText";
import { joinEdits, modeEdits, newMaskEdits } from "./stencilEdits";
import { useStencilEdit, useStencilMasks } from "./useStencil";

/**
 * The Mask submenu of the inspector's Emitter menu: draw the emitter inside a mask of the
 * system, make a mask from the emitter, or turn its stencil off.
 *
 * A simple emitter reads no stencil fields, so it draws no submenu. "The stencil" in
 * docs/ux/BIN_EDITOR.md.
 */
export function MaskSubmenu() {
  const edit = useStencilEdit();
  const masks = useStencilMasks();
  const emitter = useEmitterModel();
  const system = use(VfxRunContext)?.system ?? null;
  if (edit === null || emitter === undefined || system === null || emitter.simple) return null;

  const current = maskUse(emitter);
  const free = freeReference(masks);
  /* A mask the emitter writes is left out, since an emitter is not drawn inside its own mask. */
  const joinable = masks.filter(
    (mask) =>
      !mask.writers.includes(emitter) && !(current?.key === mask.key && current.role === "inside"),
  );

  const create = () => {
    if (free === null) return;

    const taken = new Set(system.emitters.map((each) => each.name));
    const name = freeName(taken, `${emitter.name}_mask`);
    void edit.apply(
      newMaskEdits({ index: edit.index, node: edit.node, pass: emitter.pass }, free, name),
    );
  };

  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger icon={<SelectionAllIcon />}>
        {m.workshop_bin_stencil_menu_label()}
      </Menu.SubmenuTrigger>
      <Menu.SubmenuContent data-ui="MaskSubmenu" className="max-h-96 w-72 overflow-y-auto">
        {joinable.length > 0 && (
          <>
            <Menu.Group>
              <Menu.GroupLabel>{m.workshop_bin_stencil_menu_inside_label()}</Menu.GroupLabel>
              {joinable.map((mask) => (
                <Menu.Item
                  key={mask.key}
                  onClick={() =>
                    void edit.apply(joinEdits(edit.index, STENCIL_MODE.testEqual, mask, edit.node))
                  }
                >
                  <span className="flex min-w-0 flex-col">
                    <span>{maskLabel(mask)}</span>
                    <span className="truncate text-meta text-surface-400">{writersLine(mask)}</span>
                  </span>
                </Menu.Item>
              ))}
            </Menu.Group>
            <Menu.Separator />
          </>
        )}
        <Menu.Item icon={<SelectionPlusIcon />} disabled={free === null} onClick={create}>
          {m.workshop_bin_stencil_menu_new_action()}
        </Menu.Item>
        {current !== null && (
          <Menu.Item
            icon={<ProhibitIcon />}
            onClick={() => void edit.apply(modeEdits(edit.index, STENCIL_MODE.disabled))}
          >
            {m.workshop_bin_stencil_menu_off_action()}
          </Menu.Item>
        )}
      </Menu.SubmenuContent>
    </Menu.SubmenuRoot>
  );
}
