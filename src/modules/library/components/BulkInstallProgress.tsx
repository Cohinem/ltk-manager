import { ProgressBar } from "@/components";
import type { InstallProgress } from "@/lib/tauri";

interface BulkInstallProgressProps {
  progress: InstallProgress | null;
}

export function BulkInstallProgress({ progress }: BulkInstallProgressProps) {
  if (!progress) {
    return <ProgressBar value={null} label="Preparing import..." />;
  }

  return (
    <>
      <ProgressBar
        value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
        label={`${progress.current} / ${progress.total}`}
      />
      <p className="truncate text-sm text-surface-400">{progress.currentFile}</p>
    </>
  );
}
