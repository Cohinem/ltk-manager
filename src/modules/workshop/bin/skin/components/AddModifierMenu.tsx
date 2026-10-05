import { PlusIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";

import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { addModifierEdits } from "../utils/dynamicsEdits";
import { MODIFIER_KINDS } from "../utils/poseModifiers";
import { usePhysicsScope } from "./PhysicsCells";

/**
 * Adds a pose modifier of any class to the end of the skin's list, at the class's defaults.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md. A joint's own menu in the Skeleton pane adds
 * the kinds that hang on one joint with that joint filled in.
 */
export function AddModifierMenu() {
  const { entry, skin } = usePhysicsScope();
  const send = useDynamicsEdit(entry);

  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={send === null}
        render={
          <Button variant="ghost" size="xs" left={<PlusIcon />}>
            {m.workshop_bin_physics_add_modifier_action()}
          </Button>
        }
      />
      <Menu.Content align="end" data-ui="AddModifierMenu" className="w-56">
        {MODIFIER_KINDS.map((kind) => (
          <Menu.Item
            key={kind.class}
            icon={<kind.icon />}
            onClick={() => send?.(addModifierEdits(skin, kind.class))}
          >
            {kind.title()}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}
