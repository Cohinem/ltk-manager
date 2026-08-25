import { FolderOpenIcon } from "@phosphor-icons/react";

import { PathField, SectionCard } from "@/components";
import type { Settings } from "@/lib/tauri";

import { SettingRow } from "./SettingRow";

interface WorkshopPathSectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function WorkshopPathSection({ settings, onSave }: WorkshopPathSectionProps) {
  return (
    <SectionCard title="Project storage" icon={<FolderOpenIcon className="h-5 w-5" />}>
      <SettingRow
        kind="action"
        layout="stacked"
        title="Workshop directory"
        setting="workshopPath"
        description="Where your mod projects are stored for the Creator Workshop. This directory holds all your project folders."
        control={
          <PathField
            pick="directory"
            aria-label="Workshop directory"
            value={settings.workshopPath}
            onSelect={(path) => onSave({ ...settings, workshopPath: path })}
            placeholder="Not configured"
            dialogTitle="Select Workshop Directory"
          />
        }
      />
    </SectionCard>
  );
}
