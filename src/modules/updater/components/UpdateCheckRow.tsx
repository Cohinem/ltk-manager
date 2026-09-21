import { ArrowsClockwiseIcon, DownloadIcon } from "@phosphor-icons/react";

import { Button } from "@/components";
import { m } from "@/i18n";
import {
  useUpdaterCheckedAt,
  useUpdaterCheckError,
  useUpdaterChecking,
  useUpdaterSetDialogOpen,
  useUpdaterUpdate,
} from "@/stores";

import { useCheckForUpdate } from "../api";

/** Where the running build stands against the latest release, and a press to ask again. */
export function UpdateCheckRow() {
  const checking = useUpdaterChecking();
  const checkedAt = useUpdaterCheckedAt();
  const checkError = useUpdaterCheckError();
  const update = useUpdaterUpdate();
  const setDialogOpen = useUpdaterSetDialogOpen();
  const checkForUpdate = useCheckForUpdate();

  const status = checking
    ? m.updater_check_running_label()
    : checkError
      ? m.updater_check_failed_label()
      : update
        ? m.updater_check_found_label({ version: update.version })
        : checkedAt !== null
          ? m.updater_check_current_label()
          : null;

  return (
    <div className="flex items-center justify-between gap-3" data-ui="UpdateCheckRow">
      <p className="text-sm text-surface-400" aria-live="polite">
        {status}
      </p>
      {update ? (
        <Button
          variant="outline"
          size="sm"
          left={<DownloadIcon className="h-4 w-4" />}
          onClick={() => setDialogOpen(true)}
        >
          {m.updater_view_action()}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          left={<ArrowsClockwiseIcon className="h-4 w-4" />}
          loading={checking}
          onClick={() => void checkForUpdate()}
        >
          {m.updater_check_action()}
        </Button>
      )}
    </div>
  );
}
