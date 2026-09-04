import { PathField, SectionCard, SkinIcon } from "@/components";
import type { Settings } from "@/lib/tauri";

import { SettingRow } from "./SettingRow";

interface LeagueSkinsSectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function LeagueSkinsSection({ settings, onSave }: LeagueSkinsSectionProps) {
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
            onSelect={(path) => onSave({ ...settings, leagueSkinsPath: path })}
            placeholder="Not configured"
            dialogTitle="Select LeagueSkins Directory"
          />
        }
      />
    </SectionCard>
  );
}
