import { FolderOpenIcon } from "@phosphor-icons/react";

import { PathField, SectionCard } from "@/components";

import { useLoadedSettings, useUpdateSettings } from "../api";
import { SettingRow } from "./SettingRow";

export function WorkshopPathSection() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  return (
    <SectionCard title="Project storage" icon={<FolderOpenIcon className="size-5" />}>
      <SettingRow
        kind="action"
        layout="stacked"
        setting="workshopPath"
        description="Where your mod projects are stored for the Creator Workshop. This directory holds all your project folders."
        control={
          <PathField
            pick="directory"
            aria-label="Workshop directory"
            value={settings.workshopPath}
            onSelect={(path) => update({ workshopPath: path })}
            placeholder="Not configured"
            dialogTitle="Select Workshop Directory"
          />
        }
      />
    </SectionCard>
  );
}
