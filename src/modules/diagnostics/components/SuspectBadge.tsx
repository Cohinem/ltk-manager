import { WarningIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { Badge, Tooltip } from "@/components";
import { useIncidentLineStore } from "@/stores";

import { useLatestIncident } from "../api";

interface SuspectBadgeProps {
  /** A library mod's id, for a mod card. */
  modId?: string;
  /** A workshop project's absolute path, for a project card. */
  projectPath?: string;
  /** A disabled mod answers the question itself, so it carries no badge. */
  enabled?: boolean;
}

/**
 * The suspect mark on the card of a mod or a project the newest undismissed
 * incident names. A click opens the Games tab on that incident.
 *
 * Per "The suspect badge" in docs/ux/LEAGUE_DIAGNOSTICS.md. The badge is a
 * question about the last game, and it goes when the user dismisses the
 * incident, disables the mod, or a newer game runs clean.
 */
export function SuspectBadge({ modId, projectPath, enabled = true }: SuspectBadgeProps) {
  const latest = useLatestIncident();
  const answeredId = useIncidentLineStore((s) => s.answeredIncidentId);
  const navigate = useNavigate();

  if (!enabled || !latest || latest.id === answeredId) return null;

  const named = latest.suspects.some(
    (suspect) =>
      (modId !== undefined && suspect.modId === modId) ||
      (projectPath !== undefined && suspect.projectPath === projectPath),
  );
  if (!named) return null;

  const tooltipContent = (
    <div className="max-w-[240px] space-y-1">
      <p className="font-semibold text-surface-100">Suspected</p>
      <p className="text-xs text-surface-200">
        Named in {latest.verdict.title}, the last game that went wrong.
      </p>
      <p className="text-xs text-surface-300">Click to review.</p>
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <Badge
        size="lg"
        tone="warning"
        data-ui="SuspectBadge"
        icon={<WarningIcon weight="bold" className="size-4" />}
        onClick={(event) => {
          event.stopPropagation();
          navigate({ to: "/diagnostics", search: { tab: "games", incident: latest.id } });
        }}
        aria-label={`Suspected in "${latest.verdict.title}", click to review`}
      />
    </Tooltip>
  );
}
