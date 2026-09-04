import { CaretRightIcon, SpinnerGapIcon } from "@phosphor-icons/react";

import { AlertBox, type AlertBoxVariant } from "@/components";

import { type HomeStatusAction, type HomeStatusTone, useHomeStatus } from "../api";

/* The hue is the severity's: DS-KIND-HUE. */
const VARIANT: Record<HomeStatusTone, AlertBoxVariant> = {
  muted: "neutral",
  warning: "warning",
  danger: "error",
};

/** The build League is on, once a query reads it. `null` keeps the build's row off the page. */
const INSTALLED_GAME_BUILD: string | null = null;

/** What stands between the reader and Play, drawn under the button it qualifies. */
export function StatusLine() {
  const status = useHomeStatus({ installedGameBuild: INSTALLED_GAME_BUILD });

  if (!status) return null;

  if (!status.action) {
    return (
      <AlertBox
        data-ui="StatusLine"
        className="shrink-0"
        variant={VARIANT[status.tone]}
        title={status.line}
      />
    );
  }

  return (
    <AlertBox
      data-ui="StatusLine"
      className="shrink-0"
      variant={VARIANT[status.tone]}
      title={status.line}
      disabled={status.action.pending}
      onClick={status.action.run}
      actions={<ActionLabel action={status.action} />}
    />
  );
}

/** The errand's own word, riding the first line so it needs no row of its own. */
function ActionLabel({ action }: { action: HomeStatusAction }) {
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-surface-300">
      {action.label}
      {action.pending && <SpinnerGapIcon className="h-3.5 w-3.5 animate-spin" />}
      {!action.pending && <CaretRightIcon weight="bold" className="h-3.5 w-3.5" />}
    </span>
  );
}
