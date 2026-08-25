import { useState } from "react";

import type { Settings } from "@/lib/tauri";
import { MigrationSection, MigrationWizardDialog } from "@/modules/migration";

import { LeagueSection } from "./LeagueSection";
import { StartupAndTraySection } from "./StartupAndTraySection";

interface GeneralSectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function GeneralSection({ settings, onSave }: GeneralSectionProps) {
  const [migrationOpen, setMigrationOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <LeagueSection settings={settings} onSave={onSave} />
      <StartupAndTraySection settings={settings} onSave={onSave} />
      <MigrationSection onImport={() => setMigrationOpen(true)} />
      <MigrationWizardDialog open={migrationOpen} onClose={() => setMigrationOpen(false)} />
    </div>
  );
}
