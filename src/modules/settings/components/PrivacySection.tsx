import { ShieldCheckIcon } from "@phosphor-icons/react";

import { Button, Code, ExternalLink, SectionCard, useToast } from "@/components";
import { m } from "@/i18n";

import { useResetTelemetrySecret, useTelemetryIdentity } from "../api";
import { PRIVACY_PAGE_URL } from "../privacyPage";
import { SettingGroup } from "./SettingGroup";
import { SettingRow } from "./SettingRow";
import { SettingSwitch } from "./SettingSwitch";

/** What leaves the machine, and the two controls a reader has over it. */
export function PrivacySection() {
  const { data: identity } = useTelemetryIdentity();
  const resetSecret = useResetTelemetrySecret();
  const toast = useToast();

  const handleReset = () => {
    resetSecret.mutate(undefined, {
      onError: () => toast.error(m.diagnostics_reset_identity_failed_title()),
    });
  };

  return (
    <SectionCard
      title={m.diagnostics_privacy_title()}
      description={m.diagnostics_privacy_description()}
      icon={<ShieldCheckIcon className="size-5" />}
    >
      <SettingGroup id="general.privacy" title={m.diagnostics_privacy_title()}>
        <SettingRow
          setting="telemetryEnabled"
          description={m.diagnostics_telemetry_row_description()}
          control={<SettingSwitch setting="telemetryEnabled" />}
        />

        <div className="flex flex-col gap-3 pl-7 select-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-surface-300">{m.diagnostics_identity_label()}</span>
            {identity && <Code className="select-text">{identity}</Code>}
            {!identity && (
              <span className="text-sm text-surface-400">{m.diagnostics_identity_off_label()}</span>
            )}
          </div>
          <p className="text-xs text-surface-400">{m.diagnostics_identity_hint()}</p>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" loading={resetSecret.isPending} onClick={handleReset}>
              {m.diagnostics_reset_identity_action()}
            </Button>
            <ExternalLink href={PRIVACY_PAGE_URL} className="text-sm">
              {m.diagnostics_privacy_page_action()}
            </ExternalLink>
          </div>
          <p className="text-xs text-surface-400">{m.diagnostics_reset_identity_hint()}</p>
        </div>
      </SettingGroup>
    </SectionCard>
  );
}
