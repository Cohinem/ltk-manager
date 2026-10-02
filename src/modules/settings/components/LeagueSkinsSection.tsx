import { PathField, SectionCard, SkinIcon } from "@/components";

import { useLoadedSettings, useUpdateSettings } from "../api";
import { SettingRow } from "./SettingRow";

export function LeagueSkinsSection() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();

  return (
    <SectionCard title="LeagueSkins" icon={<SkinIcon className="h-5 w-5" />}>
      <SettingRow
        kind="action"
        layout="stacked"
        setting="leagueSkinsPath"
        description="Where your LeagueSkins collection lives. The Native page installs skins straight from this directory."
        control={
          <PathField
            pick="directory"
            aria-label="LeagueSkins directory"
            value={settings.leagueSkinsPath}
            onSelect={(path) => update({ leagueSkinsPath: path })}
            placeholder="Not configured"
            dialogTitle="Select LeagueSkins Directory"
          />
        }
      />
    </SectionCard>
  );
}
