import { BooksIcon } from "@phosphor-icons/react";

import { PathField, SectionCard, Switch } from "@/components";
import { m } from "@/i18n";
import type { Settings } from "@/lib/tauri";

import { ExperimentalChip } from "./ExperimentalChip";
import { SettingGroup } from "./SettingGroup";
import { SettingRow } from "./SettingRow";
import { TrustedDomainsEditor } from "./TrustedDomainsEditor";

interface LibrarySectionProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function LibrarySection({ settings, onSave }: LibrarySectionProps) {
  return (
    <SectionCard
      title={m.settings_library_title()}
      icon={<BooksIcon className="h-5 w-5" />}
      description={m.settings_library_description()}
    >
      <SettingGroup id="library.storage" title={m.settings_library_storage_title()}>
        <SettingRow
          kind="action"
          layout="stacked"
          setting="modStoragePath"
          description={m.settings_library_storage_description()}
          control={
            <PathField
              pick="directory"
              aria-label={m.settings_library_storage_label()}
              value={settings.modStoragePath}
              onSelect={(path) => onSave({ ...settings, modStoragePath: path })}
              placeholder={m.settings_library_storage_placeholder()}
              dialogTitle={m.settings_library_storage_dialog_title()}
            />
          }
        />
      </SettingGroup>

      <SettingGroup id="library.cataloguing" title={m.settings_library_cataloguing_title()}>
        <SettingRow
          setting="autoCategorizationEnabled"
          description={m.settings_library_categorization_description()}
          hint={m.settings_library_categorization_hint()}
          control={
            <Switch
              checked={settings.autoCategorizationEnabled}
              onCheckedChange={(checked) =>
                onSave({ ...settings, autoCategorizationEnabled: checked })
              }
            />
          }
        />

        <SettingRow
          setting="watcherEnabled"
          badge={<ExperimentalChip />}
          description={m.settings_library_watcher_description()}
          hint={m.settings_library_watcher_hint()}
          control={
            <Switch
              checked={settings.watcherEnabled}
              onCheckedChange={(checked) => onSave({ ...settings, watcherEnabled: checked })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup id="library.priority" title={m.settings_library_priority_title()}>
        <SettingRow
          setting="promoteEnabledMods"
          description={m.settings_library_promotion_description()}
          control={
            <Switch
              aria-label={m.settings_library_promotion_title()}
              checked={settings.promoteEnabledMods}
              onCheckedChange={(checked) => onSave({ ...settings, promoteEnabledMods: checked })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup id="library.installing" title={m.settings_library_installing_title()}>
        <SettingRow
          kind="action"
          layout="stacked"
          setting="trustedDomains"
          description={m.settings_library_trusted_domains_description()}
          control={<TrustedDomainsEditor settings={settings} onSave={onSave} />}
        />
      </SettingGroup>
    </SectionCard>
  );
}
