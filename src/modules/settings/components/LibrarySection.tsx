import { BooksIcon } from "@phosphor-icons/react";

import { PathField, SectionCard } from "@/components";
import { m } from "@/i18n";

import { useLoadedSettings, useUpdateSettings } from "../api";
import { ExperimentalChip } from "./ExperimentalChip";
import { SettingGroup } from "./SettingGroup";
import { SettingRow } from "./SettingRow";
import { SettingSwitch } from "./SettingSwitch";
import { TrustedDomainsEditor } from "./TrustedDomainsEditor";

export function LibrarySection() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  return (
    <SectionCard
      title={m.settings_library_title()}
      icon={<BooksIcon className="size-5" />}
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
              onSelect={(path) => update({ modStoragePath: path })}
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
          control={<SettingSwitch setting="autoCategorizationEnabled" />}
        />

        <SettingRow
          setting="watcherEnabled"
          badge={<ExperimentalChip />}
          description={m.settings_library_watcher_description()}
          hint={m.settings_library_watcher_hint()}
          control={<SettingSwitch setting="watcherEnabled" />}
        />
      </SettingGroup>

      <SettingGroup id="library.priority" title={m.settings_library_priority_title()}>
        <SettingRow
          setting="promoteEnabledMods"
          description={m.settings_library_promotion_description()}
          control={
            <SettingSwitch
              setting="promoteEnabledMods"
              aria-label={m.settings_library_promotion_title()}
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
          control={<TrustedDomainsEditor />}
        />
      </SettingGroup>
    </SectionCard>
  );
}
