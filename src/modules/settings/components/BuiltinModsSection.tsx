import { PuzzlePieceIcon } from "@phosphor-icons/react";

import { SectionCard, SegmentedControl, Switch } from "@/components";
import { m } from "@/i18n";
import type { Settings } from "@/lib/tauri";

import { baseSkinsOptions } from "../builtinMods";
import { SettingRow } from "./SettingRow";
import { SettingRows } from "./SettingRows";

interface BuiltinModsSectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

/** The switches for the mods the manager generates, one row each. */
export function BuiltinModsSection({ settings, onSave }: BuiltinModsSectionProps) {
  return (
    <SectionCard
      title={m.settings_tab_builtins_title()}
      icon={<PuzzlePieceIcon className="h-5 w-5" />}
      description={m.settings_builtins_description()}
    >
      <SettingRows>
        <SettingRow
          setting="builtinMods.defaultWardSkins"
          description={m.settings_builtins_ward_skins_description()}
          hint={m.settings_builtins_ward_skins_hint()}
          control={
            <Switch
              checked={settings.builtinMods.defaultWardSkins}
              onCheckedChange={(checked) =>
                onSave({
                  ...settings,
                  builtinMods: { ...settings.builtinMods, defaultWardSkins: checked },
                })
              }
            />
          }
        />

        <SettingRow
          setting="builtinMods.baseSkins"
          description={m.settings_builtins_base_skins_description()}
          hint={m.settings_builtins_base_skins_hint()}
          control={
            <SegmentedControl
              aria-label={m.settings_builtins_base_skins_title()}
              options={baseSkinsOptions()}
              value={settings.builtinMods.baseSkins}
              onChange={(baseSkins) =>
                onSave({ ...settings, builtinMods: { ...settings.builtinMods, baseSkins } })
              }
            />
          }
        />
      </SettingRows>
    </SectionCard>
  );
}
