import { Switch } from "@/components";
import type { Settings } from "@/lib/tauri";

import { useLoadedSettings, useUpdateSettings } from "../api";

/** A setting that is a switch. */
export type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

export interface SettingSwitchProps {
  readonly setting: BooleanSettingKey;
  readonly "aria-label"?: string;
  /** Runs after the change is sent, for a setting whose change asks for more. */
  readonly onChange?: (checked: boolean) => void;
}

/** A row's switch, bound to one setting. */
export function SettingSwitch({ setting, "aria-label": ariaLabel, onChange }: SettingSwitchProps) {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();

  return (
    <Switch
      aria-label={ariaLabel}
      checked={settings[setting]}
      onCheckedChange={(checked) => {
        update({ [setting]: checked } as Partial<Settings>);
        onChange?.(checked);
      }}
    />
  );
}
