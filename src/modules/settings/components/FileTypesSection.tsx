import { CheckCircleIcon, FileArchiveIcon } from "@phosphor-icons/react";

import { Button, SectionCard, useToast } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { FileTypeOwner, FileTypeStatus, ModFileType } from "@/lib/tauri";

import { useLoadedSettings } from "../api";
import { useFileTypes, useOpenDefaultApps } from "../api/useIntegrations";
import { SettingRow } from "./SettingRow";
import { SettingSwitch } from "./SettingSwitch";

function typeLabel(fileType: ModFileType): string {
  const labels: Record<ModFileType, string> = {
    fantome: m.settings_file_types_fantome_label(),
    modpkg: m.settings_file_types_modpkg_label(),
  };
  return labels[fileType];
}

function ownerLabel(owner: FileTypeOwner): string {
  if (owner.kind === "manager") {
    return m.settings_file_types_manager_label();
  }

  if (owner.kind === "other") {
    return m.settings_file_types_other_label({ program: owner.program });
  }

  return m.settings_file_types_unassigned_label();
}

function FileTypeRow({ status, hidden }: { status: FileTypeStatus; hidden: boolean }) {
  const toast = useToast();
  const openDefaultApps = useOpenDefaultApps();
  const opensWithManager = status.owner.kind === "manager";

  function choose() {
    openDefaultApps.mutate(undefined, {
      onError: (error) =>
        toast.error(m.settings_file_types_choose_error_title(), errorSummary(error)),
    });
  }

  return (
    <SettingRow
      dependent
      hidden={hidden}
      size="sm"
      kind="action"
      title={typeLabel(status.fileType)}
      description={ownerLabel(status.owner)}
      control={
        <>
          {opensWithManager && (
            <CheckCircleIcon weight="duotone" className="size-5 text-success-text" />
          )}
          {!opensWithManager && (
            <Button
              compact
              size="sm"
              className="text-row"
              variant="outline"
              disabled={openDefaultApps.isPending}
              onClick={choose}
            >
              {m.settings_file_types_choose_action()}
            </Button>
          )}
        </>
      }
    />
  );
}

/**
 * The switch that registers `.fantome` and `.modpkg` with Explorer, and which
 * program opens each one once it is on.
 *
 * Draws nothing until the status arrives, and nothing off Windows, where the
 * backend reports no types.
 */
export function FileTypesSection() {
  const settings = useLoadedSettings();
  const { data: statuses } = useFileTypes();

  if (!statuses || statuses.length === 0) return null;

  const registered = settings.registerFileTypes;
  const othersOwn = statuses.some((status) => status.owner.kind !== "manager");

  return (
    <div data-ui="FileTypesSection">
      <SectionCard
        title={m.settings_file_types_title()}
        description={m.settings_file_types_description()}
        icon={<FileArchiveIcon weight="duotone" className="size-5" />}
      >
        <SettingRow
          setting="registerFileTypes"
          description={m.settings_file_types_register_description()}
          control={<SettingSwitch setting="registerFileTypes" />}
        />
        {statuses.map((status) => (
          <FileTypeRow key={status.fileType} status={status} hidden={!registered} />
        ))}
        {registered && othersOwn && (
          <p className="ml-4 text-meta text-surface-400">{m.settings_file_types_choose_hint()}</p>
        )}
      </SectionCard>
    </div>
  );
}
