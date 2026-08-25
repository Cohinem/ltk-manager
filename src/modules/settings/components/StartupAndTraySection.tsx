import { MonitorDown } from "lucide-react";

import { SectionCard, Switch } from "@/components";
import type { Settings } from "@/lib/tauri";

import { SettingGroup } from "./SettingGroup";
import { SettingRow } from "./SettingRow";

interface StartupAndTraySectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function StartupAndTraySection({ settings, onSave }: StartupAndTraySectionProps) {
  return (
    <SectionCard title="Startup and tray" icon={<MonitorDown className="h-5 w-5" />}>
      <SettingGroup id="startup" title="Startup">
        <SettingRow
          title="Auto run"
          setting="autoRun"
          description="Automatically launch LTK Manager when you start your computer."
          control={
            <Switch
              checked={settings.autoRun}
              onCheckedChange={(checked) => onSave({ ...settings, autoRun: checked })}
            />
          }
        />

        <SettingRow
          title="Start in tray unless update available"
          setting="startInTrayUnlessUpdate"
          dependent
          hidden={!settings.autoRun}
          description="Stay hidden in the tray on autostart, and show the window when a new update is ready."
          control={
            <Switch
              checked={settings.startInTrayUnlessUpdate}
              onCheckedChange={(checked) =>
                onSave({ ...settings, startInTrayUnlessUpdate: checked })
              }
            />
          }
        />

        <SettingRow
          title="Always start patcher at launch"
          setting="alwaysStartPatcher"
          description="Starts your last active profile every time the app launches."
          control={
            <Switch
              checked={settings.alwaysStartPatcher}
              onCheckedChange={(checked) => onSave({ ...settings, alwaysStartPatcher: checked })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup id="tray" title="Tray">
        <SettingRow
          title="Minimize to system tray"
          setting="minimizeToTray"
          description="Minimizing hides the window to the tray instead of the taskbar. Click the tray icon to restore it."
          control={
            <Switch
              checked={settings.minimizeToTray}
              onCheckedChange={(checked) => onSave({ ...settings, minimizeToTray: checked })}
            />
          }
        />

        <SettingRow
          title="Start minimized to tray"
          setting="startInTray"
          description="The app starts hidden in the tray. Click the tray icon to open it."
          control={
            <Switch
              checked={settings.startInTray}
              onCheckedChange={(checked) => onSave({ ...settings, startInTray: checked })}
            />
          }
        />
      </SettingGroup>
    </SectionCard>
  );
}
