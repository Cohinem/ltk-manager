import { PackageX } from "lucide-react";

import { Badge, Tooltip } from "@/components";
import { useSettings } from "@/modules/settings";
import { useLinkedBinGuardStore } from "@/stores";

import { useLinkedBinOffender } from "../api";

interface MissingDepsBadgeProps {
  modId: string;
  enabled: boolean;
}

/**
 * Amber pill on a mod card flagging that the mod's property-bins reference linked
 * dependencies that didn't resolve in the most recent overlay build. Clicking it
 * opens the reachable {@link LinkedBinWarningDialog} to review or disable.
 *
 * Passive by design, so it never blocks patching (missing linked bins are non-fatal at
 * injection). Hidden for disabled mods (they're excluded from the build, so any prior
 * flag is stale) and when the dependency check is turned off in settings.
 */
export function MissingDepsBadge({ modId, enabled }: MissingDepsBadgeProps) {
  const { data: settings } = useSettings();
  const { data: offender } = useLinkedBinOffender(modId);
  const openDialog = useLinkedBinGuardStore((s) => s.openDialog);

  if (!enabled) return null;
  if (settings?.linkedBinCheckEnabled === false) return null;
  if (!offender) return null;

  const count = offender.missingLinks.length;
  const tooltipContent = (
    <div className="max-w-[240px] space-y-1">
      <p className="font-semibold text-surface-100">Missing dependencies</p>
      <p className="text-xs text-surface-200">
        References {count} game file{count === 1 ? "" : "s"} that aren&apos;t installed. League may
        glitch or crash when it loads this mod. Click to review or disable.
      </p>
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <Badge
        size="lg"
        tone="warning"
        icon={<PackageX className="size-3" />}
        onClick={openDialog}
        aria-label={`${count} missing ${count === 1 ? "dependency" : "dependencies"}, click to review`}
      >
        {count}
      </Badge>
    </Tooltip>
  );
}
