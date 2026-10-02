import { MonitorIcon } from "@phosphor-icons/react";

import { SectionCard, SegmentedControl, Switch } from "@/components";
import { m } from "@/i18n";
import type { OpenOn } from "@/lib/tauri";
import { discardDownload } from "@/modules/updater";

import { useLoadedSettings, useUpdateSettings } from "../api";
import { SettingGroup } from "./SettingGroup";
import { SettingRow } from "./SettingRow";
import { SettingSwitch } from "./SettingSwitch";

const OPEN_ON_OPTIONS: { value: OpenOn; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "mods", label: "Mods" },
  { value: "workshop", label: "Workshop" },
];

export function StartupAndTraySection() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  const saveAutoDownload = (checked: boolean) => {
    update({ autoDownloadUpdates: checked });
    if (!checked) void discardDownload();
  };

  return (
    <SectionCard title="Startup and tray" icon={<MonitorIcon className="size-5" />}>
      <SettingGroup id="general.startup" title="Startup">
        <SettingRow
          setting="autoRun"
          description="Automatically launch LTK Manager when you start your computer."
          control={<SettingSwitch setting="autoRun" />}
        />

        <SettingRow
          setting="startInTrayUnlessUpdate"
          dependent
          hidden={!settings.autoRun}
          description="Stay hidden in the tray on autostart, and show the window when a new update is ready."
          control={<SettingSwitch setting="startInTrayUnlessUpdate" />}
        />

        <SettingRow
          setting="alwaysStartPatcher"
          description="Starts your last active profile every time the app launches."
          control={<SettingSwitch setting="alwaysStartPatcher" />}
        />

        <SettingRow
          kind="action"
          setting="openOn"
          control={
            <SegmentedControl
              options={OPEN_ON_OPTIONS}
              value={settings.openOn}
              onChange={(openOn) => update({ openOn })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup id="general.tray" title="Tray">
        <SettingRow
          setting="minimizeToTray"
          description="Minimizing hides the window to the tray instead of the taskbar. Click the tray icon to restore it."
          control={<SettingSwitch setting="minimizeToTray" />}
        />

        <SettingRow
          setting="startInTray"
          description="The app starts hidden in the tray. Click the tray icon to open it."
          control={<SettingSwitch setting="startInTray" />}
        />
      </SettingGroup>

      <SettingGroup id="general.updates" title={m.settings_updates_title()}>
        <SettingRow
          setting="autoDownloadUpdates"
          description={m.settings_updates_auto_download_description()}
          control={
            <Switch checked={settings.autoDownloadUpdates} onCheckedChange={saveAutoDownload} />
          }
        />
      </SettingGroup>
    </SectionCard>
  );
}
