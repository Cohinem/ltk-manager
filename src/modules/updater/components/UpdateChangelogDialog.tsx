import { Download, Sparkles } from "lucide-react";

import { AlertBox, Button, Checkbox, Dialog, Progress } from "@/components";
import {
  useUpdaterDialogOpen,
  useUpdaterDismissError,
  useUpdaterDownloadAndInstall,
  useUpdaterError,
  useUpdaterProgress,
  useUpdaterSetDialogOpen,
  useUpdaterSetSkipVersion,
  useUpdaterSkippedVersion,
  useUpdaterUpdate,
  useUpdaterUpdating,
} from "@/stores";

import { ChangelogContent } from "./ChangelogContent";

export function UpdateChangelogDialog() {
  const update = useUpdaterUpdate();
  const dialogOpen = useUpdaterDialogOpen();
  const setDialogOpen = useUpdaterSetDialogOpen();
  const downloadAndInstall = useUpdaterDownloadAndInstall();
  const updating = useUpdaterUpdating();
  const progress = useUpdaterProgress();
  const error = useUpdaterError();
  const dismissError = useUpdaterDismissError();
  const skippedVersion = useUpdaterSkippedVersion();
  const setSkipVersion = useUpdaterSetSkipVersion();
  if (!update) return null;

  const skipped = skippedVersion === update.version;

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={updating ? undefined : setDialogOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Overlay size="lg" data-ui="UpdateChangelogDialog">
          <Dialog.Header tone="accent">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/15">
                <Sparkles className="size-5 text-accent-400" />
              </span>
              <div>
                <Dialog.Title>What&apos;s New</Dialog.Title>
                <p className="text-xs font-medium text-accent-400">
                  v{update.currentVersion} &rarr; v{update.version}
                </p>
              </div>
            </div>
            {!updating && <Dialog.Close />}
          </Dialog.Header>

          <Dialog.Body className="flex flex-col gap-4">
            {error && (
              <AlertBox variant="error" title="Update failed" onDismiss={dismissError}>
                {error}
              </AlertBox>
            )}

            {updating && (
              <div className="flex flex-col gap-1.5">
                <Progress.Root
                  value={progress}
                  label="Installing update"
                  valueLabel={`${progress}%`}
                >
                  <Progress.Track>
                    <Progress.Indicator />
                  </Progress.Track>
                </Progress.Root>
                <p className="text-sm text-surface-400">
                  The app restarts once the install finishes.
                </p>
              </div>
            )}

            <div className="max-h-[50vh] overflow-y-auto">
              <ChangelogContent body={update.body} />
            </div>
          </Dialog.Body>

          {!updating && (
            <Dialog.Footer className="items-center justify-between">
              <Checkbox
                size="sm"
                label="Skip this version"
                checked={skipped}
                onCheckedChange={(val) => setSkipVersion(val === true)}
              />
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="filled"
                  left={<Download className="h-4 w-4" />}
                  onClick={downloadAndInstall}
                >
                  {error ? "Retry Update" : "Update Now"}
                </Button>
              </div>
            </Dialog.Footer>
          )}
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
