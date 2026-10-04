import { AtomIcon } from "@phosphor-icons/react";

import { Menu } from "@/components";
import { m } from "@/i18n";
import { SIMULATED_RATES } from "@/modules/viewport";
import {
  usePreviewColliders,
  usePreviewPhysics,
  usePreviewSimulatedJoints,
  usePreviewSockets,
  useSetPreviewDisplay,
} from "@/stores";

import { SplitToggle } from "../../shared/preview/ViewportControls";

export interface PhysicsMenuProps {
  /** The steps a second the pose is simulated at, and null for a skin with nothing to simulate. */
  readonly rate: number | null;
  readonly onRateChange: (rate: number) => void;
}

/**
 * The dynamics overlay's switch and what it draws, as one split control: the simulated
 * joints with their radii, links and ground, the colliders, and the sockets. Under them,
 * the frame rate the pose is simulated at.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md. Each drawn part is a display preference,
 * kept with the armature's.
 */
export function PhysicsMenu({ rate, onRateChange }: PhysicsMenuProps) {
  const overlay = usePreviewPhysics();
  const joints = usePreviewSimulatedJoints();
  const colliders = usePreviewColliders();
  const sockets = usePreviewSockets();
  const setDisplay = useSetPreviewDisplay();

  return (
    <SplitToggle
      label={m.workshop_bin_physics_overlay_label()}
      pressed={overlay}
      icon={<AtomIcon />}
      onClick={() => setDisplay({ previewPhysics: !overlay })}
      menuLabel={m.workshop_bin_physics_overlay_menu_label()}
    >
      <Menu.Content align="end" data-ui="PhysicsMenu" className="w-52">
        <Menu.CheckboxItem
          checked={overlay && joints}
          disabled={!overlay}
          onCheckedChange={(checked) => setDisplay({ previewSimulatedJoints: checked })}
        >
          {m.workshop_bin_physics_overlay_joints_label()}
        </Menu.CheckboxItem>
        <Menu.CheckboxItem
          checked={overlay && colliders}
          disabled={!overlay}
          onCheckedChange={(checked) => setDisplay({ previewColliders: checked })}
        >
          {m.workshop_bin_physics_overlay_colliders_label()}
        </Menu.CheckboxItem>
        <Menu.CheckboxItem
          checked={overlay && sockets}
          disabled={!overlay}
          onCheckedChange={(checked) => setDisplay({ previewSockets: checked })}
        >
          {m.workshop_bin_physics_overlay_sockets_label()}
        </Menu.CheckboxItem>
        {rate !== null && (
          <>
            <Menu.Separator />
            <Menu.Group>
              <Menu.GroupLabel>{m.workshop_bin_physics_rate_label()}</Menu.GroupLabel>
              <Menu.RadioGroup
                value={String(rate)}
                onValueChange={(picked: string) => onRateChange(Number(picked))}
              >
                {SIMULATED_RATES.map((each) => (
                  <Menu.RadioItem key={each} value={String(each)}>
                    {m.workshop_bin_physics_rate_value_label({ rate: each })}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </>
        )}
      </Menu.Content>
    </SplitToggle>
  );
}
