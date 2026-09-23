import { TrashIcon, WrenchIcon } from "@phosphor-icons/react";

import { Button } from "@/components";
import { m } from "@/i18n";

interface IntegrationActionsProps {
  installed: boolean;
  disabled: boolean;
  onAction: (action: "repair" | "uninstall") => Promise<void>;
}

/** Maintenance actions for a managed installation. */
export function IntegrationActions({ installed, disabled, onAction }: IntegrationActionsProps) {
  return (
    <div data-ui="IntegrationActions" className="flex flex-wrap items-center gap-2">
      {installed && (
        <Button
          compact
          size="sm"
          className="text-row"
          variant="outline"
          left={<WrenchIcon weight="bold" className="h-3.5 w-3.5" />}
          disabled={disabled}
          onClick={() => void onAction("repair")}
        >
          {m.settings_integrations_repair_action()}
        </Button>
      )}
      <Button
        compact
        size="sm"
        className="text-row"
        variant="outline"
        left={<TrashIcon weight="bold" className="h-3.5 w-3.5" />}
        disabled={disabled}
        onClick={() => void onAction("uninstall")}
      >
        {m.settings_integrations_uninstall_action()}
      </Button>
    </div>
  );
}
