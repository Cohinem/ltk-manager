import type { FantomeImportProgress } from "@/lib/tauri";
import { useTauriProgress } from "@/lib/useTauriProgress";

export function useFantomeImportProgress() {
  return useTauriProgress<FantomeImportProgress>("fantome-import-progress").progress;
}
