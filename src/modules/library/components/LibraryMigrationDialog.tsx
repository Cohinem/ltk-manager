import { FolderOpenIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button, Dialog } from "@/components";
import { api, type FailedConversion } from "@/lib/tauri";

import { useLayoutMigration } from "../api";

/**
 * What the library upgrade could not move.
 *
 * The upgrade itself is two renames per mod and runs unasked, reporting through
 * a toast. This is the half worth interrupting for: a mod whose files are now
 * in quarantine and whose card is greyed out until the user deals with it.
 */
export function LibraryMigrationDialog() {
  const report = useLayoutMigration();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !report || report.failed.length === 0) return null;

  const plural = report.failed.length === 1 ? "mod" : "mods";

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Overlay size="sm" data-ui="LibraryMigrationDialog">
          <Dialog.Header>
            <Dialog.Title>
              {report.failed.length} {plural} could not be upgraded
            </Dialog.Title>
          </Dialog.Header>

          <Dialog.Body className="flex flex-col gap-4">
            <p className="text-sm text-surface-300">
              Your library moved to its new layout. What is listed below could not come with it. The
              original files are safe where each row points, and each mod stays in your library
              greyed out until you remove or replace it.
            </p>

            <div className="flex flex-col gap-2">
              {report.failed.map((failure) => (
                <FailureRow key={failure.id} failure={failure} />
              ))}
            </div>
          </Dialog.Body>

          <Dialog.Footer>
            <Button variant="filled" size="sm" onClick={() => setDismissed(true)}>
              Done
            </Button>
          </Dialog.Footer>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FailureRow({ failure }: { failure: FailedConversion }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/8 p-3">
      <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-surface-100 select-text">{failure.displayName}</span>
        <span className="text-xs text-surface-400 select-text">{failure.error}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void api.revealInExplorer(failure.quarantineDir)}
      >
        <FolderOpenIcon className="h-4 w-4" weight="bold" />
        Reveal
      </Button>
    </div>
  );
}
