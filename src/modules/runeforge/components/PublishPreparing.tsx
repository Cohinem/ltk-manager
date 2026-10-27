import { Dialog, ProgressBar, Stack } from "@/components";
import { m } from "@/i18n";
import type { RuneforgePublishProgress, RuneforgePublishStage } from "@/lib/tauri";
import { formatBytes } from "@/utils/formatBytes";

/** The stage of a prepare and the bytes it has sent, while the project packs and uploads. */
export function PublishPreparing({ progress }: { progress: RuneforgePublishProgress | null }) {
  const stage = progress?.stage ?? "validating";
  const uploading = stage === "uploading" && progress !== null && progress.totalBytes > 0;

  return (
    <Dialog.Body>
      <Stack gap={2}>
        <span className="text-row text-surface-200 select-none">{stageLabel(stage)}</span>
        {uploading && (
          <>
            <ProgressBar value={(progress.bytesSent / progress.totalBytes) * 100} />
            <span className="text-meta text-surface-400 tabular-nums select-none">
              {formatBytes(progress.bytesSent)} / {formatBytes(progress.totalBytes)}
            </span>
          </>
        )}
        {!uploading && <ProgressBar value={null} />}
      </Stack>
    </Dialog.Body>
  );
}

function stageLabel(stage: RuneforgePublishStage): string {
  switch (stage) {
    case "validating":
      return m.runeforge_publish_stage_validating_label();
    case "packing":
      return m.runeforge_publish_stage_packing_label();
    case "uploading":
      return m.runeforge_publish_stage_uploading_label();
    case "inspecting":
    case "complete":
    case "error":
      return m.runeforge_publish_stage_inspecting_label();
  }
}
