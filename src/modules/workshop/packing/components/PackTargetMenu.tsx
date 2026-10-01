import { CaretDownIcon } from "@phosphor-icons/react";

import { IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { type PackTarget, usePackTarget, useSetPackTarget } from "../../state";

interface PackTargetMenuProps {
  disabled?: boolean;
  className?: string;
}

const TARGET_LABELS: Record<PackTarget, () => string> = {
  both: m.workshop_pack_both_label,
  modpkg: m.workshop_pack_modpkg_label,
  fantome: m.workshop_pack_fantome_label,
};

/** What a press of Pack writes, for the tooltip on Pack. */
export function packTargetHint(target: PackTarget): string {
  if (target === "both") return m.workshop_pack_both_hint();
  return m.workshop_pack_one_hint({ format: TARGET_LABELS[target]() });
}

/** The formats Pack writes, as a choice under the caret beside Pack. */
export function PackTargetMenu({ disabled, className }: PackTargetMenuProps) {
  const target = usePackTarget();
  const setTarget = useSetPackTarget();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            data-ui="PackTargetMenu"
            icon={<CaretDownIcon weight="bold" className="h-3.5 w-3.5" />}
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={m.workshop_pack_target_label()}
            className={twMerge("w-auto px-1.5", className)}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup className="w-60">
            <Menu.Group>
              <Menu.GroupLabel>{m.workshop_pack_target_title()}</Menu.GroupLabel>
              <Menu.RadioGroup
                value={target}
                onValueChange={(value: unknown) => setTarget(value as PackTarget)}
              >
                {(Object.keys(TARGET_LABELS) as PackTarget[]).map((option) => (
                  <Menu.RadioItem key={option} value={option} closeOnClick>
                    {TARGET_LABELS[option]()}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
