import type { GitImportProgress } from "@/lib/tauri";
import { useTauriProgress } from "@/lib/useTauriProgress";

export function useGitImportProgress() {
  return useTauriProgress<GitImportProgress>("git-import-progress").progress;
}
