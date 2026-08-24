import { Download } from "lucide-react";

import { Button, Tooltip } from "@/components";
import { useUpdaterSetDialogOpen, useUpdaterUpdate } from "@/stores";

/**
 * A persistent update button that appears in the title bar when an update is available. Clicking it opens the update dialog.
 */
export function UpdateButton() {
  const update = useUpdaterUpdate();
  const setDialogOpen = useUpdaterSetDialogOpen();

  if (!update) return null;

  return (
    <Tooltip content={`Update available - v${update.version}`}>
      <Button
        variant="ghost"
        size="sm"
        left={<Download className="h-4 w-4" />}
        onClick={() => setDialogOpen(true)}
        aria-label={`Update to v${update.version}`}
        data-ui="TitleBar:update"
        className="h-full shrink-0 rounded-none px-3 text-accent-400 hover:bg-surface-700 hover:text-accent-300 [&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-out hover:[&_svg]:scale-110"
      >
        Update
      </Button>
    </Tooltip>
  );
}
