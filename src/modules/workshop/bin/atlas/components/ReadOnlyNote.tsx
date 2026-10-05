import { LockSimpleIcon } from "@phosphor-icons/react";

import { Button, Tooltip } from "@/components";
import { m, readOnlyDescription } from "@/i18n";
import type { ReadOnly } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useProjectSwitchAction } from "../../documents/state/projectSwitch";

/**
 * The mark of a view that takes no edits, which says why on hover, with the switch into the open
 * project where the tab can make it.
 */
export function ReadOnlyNote({
  reason,
  className,
}: {
  reason: ReadOnly | null;
  className?: string;
}) {
  const toProject = useProjectSwitchAction();
  const mark = (
    <span className="flex shrink-0 items-center gap-1 text-surface-300">
      <LockSimpleIcon className="size-3.5" />
      {m.workshop_bin_read_only_label()}
    </span>
  );

  return (
    <span
      data-ui="ReadOnlyNote"
      className={twMerge("flex min-w-0 items-center gap-2 font-sans select-none", className)}
    >
      {reason === null && mark}
      {reason !== null && <Tooltip content={readOnlyDescription(reason)}>{mark}</Tooltip>}
      {toProject !== null && (
        <Button variant="ghost" size="xs" onClick={toProject.open}>
          {m.workshop_bin_atlas_edit_in_project_action({ project: toProject.project })}
        </Button>
      )}
    </span>
  );
}
