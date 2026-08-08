import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Sparkles } from "lucide-react";

import { Field, IconButton, SectionCard, Tooltip } from "@/components";
import type { Settings } from "@/lib/tauri";

interface LeagueSkinsSectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function LeagueSkinsSection({ settings, onSave }: LeagueSkinsSectionProps) {
  async function handleBrowse() {
    try {
      const selected = await open({
        directory: true,
        title: "Select LeagueSkins Directory",
      });

      if (selected) {
        onSave({ ...settings, leagueSkinsPath: selected as string });
      }
    } catch (error) {
      console.error("Failed to browse LeagueSkins directory:", error);
    }
  }

  return (
    <SectionCard title="LeagueSkins" icon={<Sparkles className="h-5 w-5" />}>
      <div className="space-y-3">
        <span className="block text-sm font-medium text-surface-400">Skin Assets Location</span>
        <div className="flex gap-2">
          <Field.Control
            type="text"
            value={settings.leagueSkinsPath || ""}
            readOnly
            placeholder="Select the LeagueSkins folder"
            className="flex-1"
          />
          <Tooltip content="Browse">
            <IconButton
              icon={<FolderOpen className="h-5 w-5" />}
              variant="outline"
              size="lg"
              onClick={handleBrowse}
            />
          </Tooltip>
        </div>
        <p className="text-sm text-surface-400">
          Choose the folder containing the champion ID directories, such as <code className="rounded bg-surface-700 px-1">classic/103</code>.
        </p>
      </div>
    </SectionCard>
  );
}
